import type { APIRequestContext } from '@playwright/test';
import type { EnvConfig } from '../../config/env';

export type HttpVerb = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'QUERY';

export interface ApiResponse {
  status: number;
  statusText: string;
  body: string;
  isSuccess: boolean;
  /** Response headers, names in lower case. */
  headers: Record<string, string>;
}

/** What BaseClient reports to `onApiCall` listeners after every request. */
export interface ApiCallInfo {
  method: HttpVerb;
  /** Full URL, including the query string. */
  url: string;
  /** Resource path relative to `apiBaseUrl`, starting with `/`. */
  path: string;
  /** Query string without the `?`, if any. */
  query?: string;
  requestBody?: unknown;
  /** Response status, or 0 when the request failed without a response. */
  status: number;
  statusText: string;
  durationMs: number;
}

export type ApiCallListener = (call: ApiCallInfo) => void;

/** A file part of a `multipart/form-data` body. */
export interface MultipartFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** The fields of a `multipart/form-data` body: text values or files. */
export type MultipartForm = Record<string, string | MultipartFile>;

/** What `onApiCall` listeners see for a multipart body: the text fields as sent, each file as its name, type and size (never its bytes). */
function describeMultipart(form: MultipartForm): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(form).map(([key, value]) => [key, typeof value === 'string' ? value : { name: value.name, mimeType: value.mimeType, size: value.buffer.length }])
  );
}

/** Options of endpoint methods that negative tests vary: the Accept header and redirects. */
export interface RequestOptions {
  /**
   * The Accept header: `application/json` when undefined; `null` leaves it out (Playwright then sends its own default,
   * which accepts any type: an APIRequestContext request can't go without an Accept header).
   */
  accept?: string | null;
  /** Redirects to follow (Playwright's default, 20, when undefined); `0` returns a 3xx response as it is. */
  maxRedirects?: number;
}

/** Options of a QUERY request with a body (see `BaseClient.queryBody`). */
export interface QueryBodyOptions {
  /** The Content-Type: `application/json` for an object body when undefined; a string body is sent with this type. */
  contentType?: string;
  /** As in `RequestOptions`. */
  accept?: string | null;
}

/**
 * A client's bearer token: a fixed one (a token the test obtained itself, or a malformed one), or a function that
 * returns one when each request is sent, so a test that runs longer than a token's life never sends an expired one.
 */
export type AccessToken = string | (() => Promise<string>);

/** A query-string value; see `queryString`. */
export type QueryValue = string | number | boolean | string[] | undefined;

/**
 * A query string from `params`, in their order: each defined value as `name=<value>`, and an array as `name[]=<value>`
 * for each item (the invalid input the 422 checks send). Undefined values are left out, so a parameter the test
 * doesn't give isn't sent at all, and an empty string is sent as `name=`. Encoded by URLSearchParams (a space is `+`).
 * Undefined when nothing is left.
 */
export function queryString(params: { readonly [name: string]: QueryValue } = {}): string | undefined {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) search.append(`${name}[]`, item);
    } else if (value !== undefined) {
      search.append(name, String(value));
    }
  }
  return search.toString() || undefined;
}

/** A credential header line of Playwright's call log, up to the end of the line or its colour code: `Authorization: Bearer ...`. */
const CREDENTIAL_HEADER = /((?:proxy-)?(?:authorization|cookie|set-cookie)[ \t]*:[ \t]*)[^\r\n\x1b]*/gi;

/**
 * The text of a failed request's error with its credentials masked. Playwright appends a call log that lists every
 * request header, the bearer token included, and the error ends up in published reports and public CI logs.
 */
function describeRequestError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(CREDENTIAL_HEADER, '$1***');
}

/**
 * Base for all API clients. Requests go through Playwright's APIRequestContext. Listeners registered with `BaseClient.onApiCall` see every call.
 *
 * Subclasses have one public method per endpoint, built on the protected verb helpers. Write methods accept their
 * request DTO or any object (`Record<string, unknown>`), so negative tests can send the invalid bodies validation
 * scenarios need; services keep the strict types. The PATCH method is called `partialUpdate`, because `patch` is the
 * verb helper.
 */
export abstract class BaseClient {
  private static readonly apiCallListeners = new Set<ApiCallListener>();

  /**
   * Calls `listener` after every request of every client in this worker (e.g. to record API coverage).
   * Returns a function that removes it. A failing listener only logs a warning; it never fails the request.
   */
  static onApiCall(listener: ApiCallListener): () => void {
    BaseClient.apiCallListeners.add(listener);
    return () => BaseClient.apiCallListeners.delete(listener);
  }

  private static notifyApiCall(call: ApiCallInfo): void {
    for (const listener of BaseClient.apiCallListeners) {
      try {
        listener(call);
      } catch (error) {
        console.warn('[BaseClient] An onApiCall listener failed:', error);
      }
    }
  }

  protected readonly request: APIRequestContext;
  protected readonly baseUrl: string;
  private readonly accessToken: AccessToken | null;

  constructor(request: APIRequestContext, config: Pick<EnvConfig, 'apiBaseUrl'>, accessToken?: AccessToken | null) {
    this.request = request;
    this.baseUrl = config.apiBaseUrl;
    this.accessToken = accessToken || null;
  }

  protected async getHeaders(contentType?: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    const token = typeof this.accessToken === 'function' ? await this.accessToken() : this.accessToken;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  protected buildUrl(resource: string, query?: string): string {
    const base = this.baseUrl.replace(/\/+$/, '');
    const path = resource.replace(/^\/+/, '');
    const url = `${base}/${path}`;

    return query ? `${url}?${query}` : url;
  }

  protected async executeRequest(
    method: HttpVerb,
    resourcePath: string,
    options?: RequestOptions & {
      data?: unknown;
      /** A body sent as-is, without JSON encoding (pass its `contentType`). Used instead of `data`. */
      rawData?: string;
      query?: string;
      contentType?: string;
      /** Extra request headers (e.g. `If-None-Match`), set after the defaults and the `accept` option. */
      headers?: Record<string, string>;
      /**
       * A `multipart/form-data` body (used instead of `data` and `rawData`). Playwright sets the Content-Type with
       * its boundary, so don't pass `contentType`. Listeners see the files as name, type and size only.
       */
      multipart?: MultipartForm;
    }
  ): Promise<ApiResponse> {
    const fullUrl = this.buildUrl(resourcePath, options?.query);
    const bodyMethods: HttpVerb[] = ['POST', 'PUT', 'PATCH', 'DELETE', 'QUERY'];
    const hasMultipart = options?.multipart !== undefined && bodyMethods.includes(method);
    const hasRawBody = !hasMultipart && options?.rawData !== undefined && bodyMethods.includes(method);
    const hasBody = !hasMultipart && !hasRawBody && options?.data !== undefined && bodyMethods.includes(method);
    const contentType = options?.contentType ?? (hasBody ? 'application/json; charset=utf-8' : undefined);
    const headers = await this.getHeaders(contentType);
    if (options?.accept === null) {
      delete headers['Accept'];
    } else if (options?.accept !== undefined) {
      headers['Accept'] = options.accept;
    }
    if (options?.headers) {
      Object.assign(headers, options.headers);
    }
    const startTime = Date.now();
    const notify = (status: number, statusText: string) =>
      BaseClient.notifyApiCall({
        method,
        url: fullUrl,
        path: `/${resourcePath.replace(/^\/+/, '')}`,
        query: options?.query || undefined,
        requestBody: hasMultipart ? describeMultipart(options.multipart!) : hasRawBody ? options.rawData : options?.data,
        status,
        statusText,
        durationMs: Date.now() - startTime,
      });

    try {
      const response = await this.request.fetch(fullUrl, {
        method,
        headers,
        data: hasRawBody ? options.rawData : hasBody ? JSON.stringify(options.data) : undefined,
        ...(hasMultipart ? { multipart: options.multipart } : {}),
        ...(options?.maxRedirects !== undefined ? { maxRedirects: options.maxRedirects } : {}),
      });
      const bodyText = await response.text();
      notify(response.status(), response.statusText());

      return {
        status: response.status(),
        statusText: response.statusText(),
        body: bodyText,
        isSuccess: response.ok(),
        headers: response.headers(),
      };
    } catch (error) {
      const message = describeRequestError(error);
      notify(0, message);
      throw new Error(`${method} ${fullUrl} failed: ${message}`);
    }
  }

  protected get(resourcePath: string, query?: string): Promise<ApiResponse> {
    return this.executeRequest('GET', resourcePath, { query });
  }

  protected post(resourcePath: string, options?: BodyOptions): Promise<ApiResponse> {
    return this.executeRequest('POST', resourcePath, options);
  }

  protected put(resourcePath: string, options?: BodyOptions): Promise<ApiResponse> {
    return this.executeRequest('PUT', resourcePath, options);
  }

  protected patch(resourcePath: string, options?: BodyOptions): Promise<ApiResponse> {
    return this.executeRequest('PATCH', resourcePath, options);
  }

  protected delete(resourcePath: string, options?: BodyOptions): Promise<ApiResponse> {
    return this.executeRequest('DELETE', resourcePath, options);
  }

  /** HTTP QUERY (RFC 10008): the criteria go in the body. `rawData` sends a non-JSON body as-is. */
  protected query(
    resourcePath: string,
    options?: BodyOptions & QueryBodyOptions & { rawData?: string }
  ): Promise<ApiResponse> {
    return this.executeRequest('QUERY', resourcePath, options);
  }

  /**
   * A QUERY request with `body`: an object is sent as JSON (`Content-Type: application/json`, no charset), a string
   * as-is with `options.contentType` (for the 415 checks). `accept: null` leaves out `Accept: application/json`.
   */
  protected queryBody(resourcePath: string, body: object | string, options?: QueryBodyOptions): Promise<ApiResponse> {
    return typeof body === 'string'
      ? this.query(resourcePath, { rawData: body, contentType: options?.contentType, accept: options?.accept })
      : this.query(resourcePath, { data: body, contentType: options?.contentType ?? 'application/json', accept: options?.accept });
  }
}

/** The body and query string of a verb helper's request. */
type BodyOptions = { data?: unknown; query?: string };

# Contracts from source code

The source is the best evidence of how an API behaves: which fields are really required, which errors are really thrown, and when. Read it systematically, and write down where each fact came from (file and function) as you go, so you can tag it and check it again at the end.

The source may live outside the current project. Read it with absolute paths (Read, Grep and Glob accept them). Never edit it.

## Order of reading

Adapt the names to what exists; the order matters more than the names.

1. **The service's README and docs**: often the only place that states deliberate quirks, the error-body shape, and how auth works.
2. **Entry point and bootstrap**: the base path and port for local runs, global middleware (CORS, body parsing, auth), and where routes are registered. Don't take production hostnames from here; the project's test config says which environment the tests use.
3. **The global error handler**: the error body shape, and which exception types become which status codes. This is the source of truth for most error codes.
4. **Route registration**: list every route with method, path, handler and middleware before reading any handler. Middleware decides auth (401 without a token, 403 without the role).
5. **For each endpoint:**
   - The request validation (schema, DTO, form request): required and optional fields, types, formats, limits → the body and the `422`/`400` conditions.
   - The handler: the success status, the response shape, and every early return or thrown error, with its condition.
   - The service or data-access layer it calls: `find-or-fail` lookups (→ 404), uniqueness constraints (→ 409 or 422), business rules.
6. **Shared libraries** the service depends on for auth, errors or validation: read the class definitions to confirm status codes; never assume one from a class name.
7. **Config and feature flags** that change endpoint behaviour.
8. **Models or entities**, only for `## Data Models` and `## Enums`.

The service's own API tests (if any) show real requests and expected statuses. They are good evidence, tagged `_(source)_`, but check them against the code: tests can be outdated or skipped.

## Framework notes

### Laravel (PHP)
- Routes: `routes/api.php` (the `api` prefix is often applied by the framework; check `bootstrap/app.php` or the route service provider). `Route::controller(X::class)->prefix('products')->group(...)`, `Route::apiResource`, `Route::match(['QUERY'], ...)`. Constants such as `ID_PARAM` are defined at the top of the file.
- Middleware on a route or group: `auth:<guard>` or a custom `Authenticate` → 401; role middleware → 403. Check `app/Http/Middleware` and how aliases are registered.
- Validation: `app/Http/Requests/<Area>/<Action>.php`, the `rules()` method. `required` → no `?`; `sometimes`/`nullable` → optional; a failing rule → `422` with the error body from the base request class or the handler. `authorize()` returning false → 403.
- Handler errors: `findOrFail` / route-model binding → `ModelNotFoundException` → usually 404; `abort(403)`; explicit `response()->json(..., 409)`.
- Error body and mappings: `app/Exceptions/Handler.php` (`render`) or `bootstrap/app.php` (`withExceptions`).
- OpenAPI annotations (`#[OA\Post(...)]` or `@OA\` doc blocks) are the spec's source: useful for descriptions, but check them against the rules and handler code.

### Express / Fastify / NestJS (Node)
- Routes: `app.get(...)`, `router.post(...)`, Fastify route files with a `schema`, Nest `@Controller` + `@Get()`/`@Post()` decorators.
- Validation: Joi/Zod/TypeBox schemas, JSON-schema in Fastify route options, Nest DTOs with `class-validator` decorators and the global `ValidationPipe` (→ 400 by default, not 422).
- Auth: middleware such as `passport.authenticate`, Nest guards (`@UseGuards`), Fastify `onRequest` hooks.
- Errors: the error-handling middleware `(err, req, res, next)`, `setErrorHandler`, Nest exception filters and built-in `HttpException` subclasses.

### Spring Boot (Java/Kotlin)
- Routes: `@RestController` + `@RequestMapping` / `@GetMapping`, with `@PathVariable`, `@RequestParam(required = ...)`, `@RequestBody`.
- Validation: `@Valid` with Bean Validation annotations (`@NotNull`, `@NotBlank`, `@Size`) → 400 by default.
- Auth: the Spring Security filter chain configuration and `@PreAuthorize`.
- Errors: `@ControllerAdvice` / `@ExceptionHandler`, `ResponseStatusException`, `@ResponseStatus` on exception classes.

### ASP.NET Core (C#)
- Routes: controllers with `[Route]`, `[HttpGet]`, or minimal APIs (`app.MapGet`).
- Validation: data annotations and `[ApiController]` automatic 400 responses, or FluentValidation.
- Auth: `[Authorize(Roles = ...)]`, `[AllowAnonymous]`, policies in `Program.cs`.
- Errors: exception-handling middleware, `ProblemDetails`, `return NotFound()` / `Conflict()` in actions.

### Django REST Framework / FastAPI (Python)
- DRF: `urls.py` routers and viewsets, serializers (`required=`, `allow_null=`) → 400, `permission_classes` → 401/403, `get_object_or_404`.
- FastAPI: `@app.get(...)` / `APIRouter`, Pydantic models (fields without defaults are required) → 422, `Depends` for auth, `HTTPException(status_code=...)`.

For another stack, find the same five things: routes, auth, validation, handler errors, the global error handler.

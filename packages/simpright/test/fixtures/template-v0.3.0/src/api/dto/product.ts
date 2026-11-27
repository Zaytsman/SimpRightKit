/** A product as the list and search endpoints return it: the fields the examples read, and a few more. */
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  is_location_offer: boolean;
  is_rental: boolean;
  in_stock: boolean;
}

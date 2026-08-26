// src/constants/permissions.ts

export const MODULES = [
  "user",
  "category",
  "product",
  "permission",
  "warehouse",
  "payment_method",
  "brand",
  "Revenue",
  "city",
  "country",
  "expenseAdmin",
  "zone",
  "POS",
  "notification",
  "variation",
  "transfer",
  "product_warehouse",
  "Taxes",
  "discount",
  "coupon",
  "Supplier",
  "customer",
  "gift_card",
  "financial_account",
  "pandel",
  "customer_group",
  "purchase",
  "popup",
  "offer",
  "point",
  "redeem_points",
  "adjustment",
  "Admin",
  "Booking",
  "cashier",
  "cashier_shift",
  "cashier_shift_report",
  "currency",
  "expense_category",
  "generate_label",
  "stock",
  "payment",
  "paymob",
  "material",
  "recipe",
  "adjustment_reason",
  "Category_Material",
  "purchase_return",
  "dashboard",
  "product_report",
  "product_movement",
  "sale_report",
  "financial_report",
  "order",
  "Units",
  "orders",
  "banner",
  "decimal_setting",
  "service_fees",
  "courier",
  "orderType",
  "stocktake",
  "wasted"
] as const;

// أسماء بس، من غير ids
export const ACTION_NAMES = ["View", "Add", "Edit", "Delete", "Status"] as const;

// export const BANNER_PAGES = ["login", "home", "brand", "category", "signup"] as const;

export const BANNER_PAGES = ["login", "home", "brand", "category", "signup"] as const;

export const ORDER_TYPES = ["delivery", "pickup"] as const;

export type ModuleName = (typeof MODULES)[number];
export type ActionName = (typeof ACTION_NAMES)[number];
// export type BannerPage = (typeof BANNER_PAGES)[number];
export type BannerPage = (typeof BANNER_PAGES)[number];
export type OrderType = (typeof ORDER_TYPES)[number];


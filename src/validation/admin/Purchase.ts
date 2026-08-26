import Joi from "joi";

export const optionSchema = Joi.string(); // مجرد ObjectId

export const createPurchaseItemOptionSchema = Joi.object({
  product_price_id: Joi.string().optional(),
  option_id: Joi.string().required(),
  quantity: Joi.number().optional()
});


export const createPurchaseItemVariationSchema = Joi.object({
  product_price_id: Joi.string().optional(),
  quantity: Joi.number().required(),
  options: Joi.array().items(Joi.object({
    option_id: Joi.string().required()
  })).optional(),
});

export const createPurchaseItemSchema = Joi.object({
  date: Joi.date().required(),
  category_id: Joi.string().optional(),
  product_id: Joi.string().optional(),
  product_code: Joi.string().optional(),
  expiry_date: Joi.date().optional(),
  unit_cost: Joi.number().required(),
  discount: Joi.number().required(),
  tax: Joi.number().required(),
  subtotal: Joi.number().required(),
  patch_number: Joi.string().optional(),
  date_of_expiery: Joi.date().optional(),
  discount_share: Joi.number().optional(),
  unit_cost_after_discount: Joi.number().optional(),
  options: Joi.array().items(createPurchaseItemOptionSchema).optional(),
  variations: Joi.array().items(createPurchaseItemVariationSchema).optional(),
});

export const createPurchaseDuePaymentSchema = Joi.object({
  date: Joi.date().required(),
  amount: Joi.number().required(),
});

export const createFinancialSchema = Joi.object({
  financial_id: Joi.string().required(),
  payment_amount: Joi.number().required(),
});

export const createInstallmentSchema = Joi.object({
  date: Joi.date().required(),
  amount: Joi.number().required(),
});

export const createPurchaseSchema = Joi.object({
  date: Joi.string().required(),
  warehouse_id: Joi.string().required(),
  receipt_img: Joi.string().optional(),
  // currency_id: Joi.string().optional(),
  supplier_id: Joi.string().optional(),
  tax_id: Joi.string().optional(),
  payment_status: Joi.string().valid("partial", "full", "later").required(),
  exchange_rate: Joi.number().required(),
  total: Joi.number().required(),
  shipping_cost: Joi.number().required(),
  grand_total: Joi.number().required(),
  discount: Joi.number().required(),
  note: Joi.string().optional(),
  purchase_items: Joi.array().items(createPurchaseItemSchema).optional(),
  purchase_materials: Joi.array().optional(), // Adding this to allow materials
  financials: Joi.array().items(createFinancialSchema).optional(),
  purchase_due_payment: Joi.array().items(createPurchaseDuePaymentSchema).optional(),
  installments: Joi.array().items(createInstallmentSchema).optional(),
  quantity: Joi.string().optional(),
});

// ___________________ Update _________________________

export const updatePurchaseItemOptionSchema = Joi.object({
  option_id: Joi.string().optional(),
});

export const updatePurchaseItemSchema = Joi.object({
  date: Joi.date().optional(),
  _id: Joi.string().optional(),
  category_id: Joi.string().optional(),
  expiry_date: Joi.date().optional(),
  product_code: Joi.string().optional(),
  product_id: Joi.string().optional(),
  quantity: Joi.number().optional(),
  unit_cost: Joi.number().optional(),
  discount: Joi.number().optional(),
  tax: Joi.number().optional(),
  subtotal: Joi.number().optional(),
  options: Joi.array().items(updatePurchaseItemOptionSchema).optional(),
});
export const updatePurchaseSchema = Joi.object({
  date: Joi.string().allow("").optional(),
  warehouse_id: Joi.string().allow("").optional(),
  supplier_id: Joi.string().allow("").optional(),
  receipt_img: Joi.string().allow("").optional(),
  currency_id: Joi.string().allow("").optional(),
  tax_id: Joi.string().allow("").optional(),
  exchange_rate: Joi.number().optional(),
  shiping_cost: Joi.number().optional(),
  discount: Joi.number().optional(),
  purchase_items: Joi.array().items(updatePurchaseItemSchema).optional(),
  installments: Joi.array().optional(),
});

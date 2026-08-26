import mongoose, { Schema } from "mongoose";

const StocktakeItemSchema = new Schema(
  {
    stocktakeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stocktake",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productPriceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductPrice",
      default: null,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
    },

    productNameSnapshot: { type: String, default: "" },
    skuSnapshot: { type: String, default: "" },

    systemQty: { type: Number, required: true },
    actualQty: { type: Number, default: null },
    difference: { type: Number, default: null },

    resolutionType: {
      type: String,
      enum: ["shortage", "surplus", "match", null],
      default: null,
    },
    resolutionStatus: {
      type: String,
      enum: ["pending", "resolved", "skipped"],
      default: "pending",
    },
    resolutionAction: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolutionReferenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null, // stores linked Purchase._id or Wasted._id depending on resolutionAction
    },
  },
  { timestamps: true }
);

StocktakeItemSchema.index({ stocktakeId: 1, resolutionType: 1 });
StocktakeItemSchema.index(
  { stocktakeId: 1, productId: 1, productPriceId: 1 },
  { unique: true }
);

export const StocktakeItemModel = mongoose.model(
  "StocktakeItem",
  StocktakeItemSchema
);

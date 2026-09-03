import { randomUUID } from "crypto";
import mongoose from "mongoose";

const wastedSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productPriceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductPrice",
      default: null, // null = base product, ID = specific variant
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    reason: {
      type: String,
      required: true,
      enum: ["theft", "lost", "stocktake_not_found", "damaged", "expired", "other"],
    },
    note: { type: String },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isApproved: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true, _id: false }
);

wastedSchema.index({ warehouseId: 1, createdAt: -1 });
wastedSchema.index({ productId: 1 });

export const WastedModel = mongoose.model("Wasted", wastedSchema);
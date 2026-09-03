
import { Request, Response } from "express";
import { BadRequest, ForbiddenError } from "../../../Errors";
import { ProductModel } from "../../../models/schema/admin/products";
import { ProductPriceModel } from "../../../models/schema/admin/product_price";
import { WastedModel } from "../../../models/schema/admin/wasted";
import { SuccessResponse } from "../../../utils/response";

// ==================== Create Wasted Entry (Without stock decrement) ====================
export const createWasted = async (req: Request, res: Response) => {
  try {
    const {
      productId,
      productPriceId = null,
      warehouseId,
      quantity,
      reason,
      note,
    } = req.body;
    const jwtUser = req.user as any;
    const userId = jwtUser?.id || jwtUser?._id;
    console.log("createWasted request body:", req.body);

    if (!productId || !warehouseId || !quantity || !reason) {
      throw new BadRequest(
        "productId, warehouseId, quantity, and reason are required"
      );
    }
    if (quantity <= 0) {
      throw new BadRequest("quantity must be greater than 0");
    }

    const product = await ProductModel.findById(productId);
    if (!product) {
      throw new BadRequest("Product not found");
    }

    if (productPriceId) {
      const productPrice = await ProductPriceModel.findById(productPriceId);
      if (!productPrice) {
        throw new BadRequest("Product price not found");
      }
    }

    // Create the Wasted record without deducting stock
    const wastedDoc = await WastedModel.create({
      productId,
      productPriceId,
      warehouseId,
      quantity,
      reason,
      note,
      userId,
      isApproved: false,
    });

    SuccessResponse(res, { message: "Wasted entry created", wastedDoc });
  } catch (error: any) {
    console.error("createWasted error:", error);
    throw new ForbiddenError(error.message || "Failed to create wasted entry");
  }
};
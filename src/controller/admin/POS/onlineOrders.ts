import { Request, Response } from "express";
import { OrderModel } from "../../../models/schema/users/Order";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";

/**
 * GET /admin/online-orders
 * جلب كل الأوردرات الأونلاين مع بيانات اليوزر ووسيلة الدفع والمخزن والمنتجات
 */
export const getAllOnlineOrders = async (req: Request, res: Response) => {
  const { status } = req.query;

  const filter: any = {
    status: { $nin: ["pending", "rejected"] },
  };

  const allowedStatuses = [
    "confirmed",
    "processing",
    "out_for_delivery",
    "delivered",
    "returned",
    "failed_to_deliver",
    "canceled",
    "scheduled",
    "refund",
  ];

  if (status && allowedStatuses.includes(status as string)) {
    filter.status = status;
  }

  // استخدام populate وجلب البيانات مباشرة من MongoDB
  const orders = await OrderModel.find(filter)
    .sort({ createdAt: -1 })
    .populate({
      path: "user",
      select: "_id name email phone",
    })
    .populate({
      path: "paymentMethod",
      select: "_id name ar_name type",
    })
    .populate({
      path: "warehouse",
      select: "_id name",
    })
    .populate({
      path: "cartItems.product",
      select: "_id name image price",
    })
    .lean();

  SuccessResponse(res, {
    message: "Online orders retrieved successfully",
    count: orders.length,
    orders,
  });
};

/**
 * GET /admin/online-orders/:id
 * جلب تفاصيل أوردر أونلاين معين
 */
export const getOnlineOrderById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const order = await OrderModel.findById(id)
    .populate({
      path: "user",
      select: "_id name email phone",
    })
    .populate({
      path: "paymentMethod",
      select: "_id name ar_name type",
    })
    .populate({
      path: "warehouse",
      select: "_id name",
    })
    .populate({
      path: "cartItems.product",
      select: "_id name image price",
    })
    .lean();

  if (!order) throw new NotFound("Order not found");

  SuccessResponse(res, {
    message: "Order retrieved successfully",
    order,
  });
};

/**
 * PATCH /admin/online-orders/:id/status
 * تغيير حالة الأوردر
 */
export const updateOnlineOrderStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, statusDescription } = req.body;

  if (status === "rejected") {
    throw new BadRequest("You Don't Have Permission to Reject Order");
  }

  const allowedStatuses = [
    "pending",
    "confirmed",
    "processing",
    "out_for_delivery",
    "delivered",
    "returned",
    "failed_to_deliver",
    "canceled",
    "scheduled",
    "refund",
  ];

  if (!status || !allowedStatuses.includes(status)) {
    throw new NotFound("Invalid status.");
  }

  // تحديث الأوردر وإرجاع النسخة المعدلة مع الـ populate
  const order = await OrderModel.findByIdAndUpdate(
    id,
    {
      $set: {
        status,
        statusDescription,
      },
    },
    { new: true }, // يرجع الدوكيومنت بعد التعديل
  )
    .populate({
      path: "user",
      select: "_id name email phone",
    })
    .populate({
      path: "paymentMethod",
      select: "_id name ar_name type",
    })
    .lean();

  if (!order) {
    throw new NotFound("Order not found");
  }

  SuccessResponse(res, {
    message: `Order status updated to ${status}`,
    order,
  });
};

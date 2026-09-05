import { Router } from "express";

import { authorizePermissions } from "../../../middlewares/haspremission";
import { catchAsync } from "../../../utils/catchAsync";
import {
  getAllOnlineOrders,
  getOnlineOrderById,
  updateOnlineOrderStatus,
} from "../../../controller/admin/POS/onlineOrders";

const router = Router();

router.get(
  "/",
  authorizePermissions("POS", "View"),
  authorizePermissions("orders", "View"),
  catchAsync(getAllOnlineOrders),
);
router.get(
  "/:id",
  authorizePermissions("POS", "View"),
  authorizePermissions("orders", "View"),
  catchAsync(getOnlineOrderById),
);
router.put(
  "/:id/status",
  authorizePermissions("POS", "Edit"),
  authorizePermissions("orders", "Edit"),
  catchAsync(updateOnlineOrderStatus),
);

export default router;

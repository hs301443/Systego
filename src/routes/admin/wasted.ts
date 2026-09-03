import { Router } from "express";
import {
  createWasted,
  getAllWasted,
  getWastedById,
  deleteWasted,
  getWastedStats,
  updateWastedStatus,
} from "../../controller/admin/wasted";
import { authorizePermissions } from "../../middlewares/haspremission";

const router = Router();

router.post("/", authorizePermissions("wasted", "Add"), createWasted);
router.get("/", authorizePermissions("wasted", "View"), getAllWasted);
router.get("/stats", authorizePermissions("wasted", "View"), getWastedStats);
router.get("/:id", authorizePermissions("wasted", "View"), getWastedById);
router.patch("/:id/status", authorizePermissions("wasted", "Edit"), updateWastedStatus);
router.delete("/:id", authorizePermissions("wasted", "Delete"), deleteWasted);

export default router;
import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import {
  createStocktake,
  getStocktakes,
  getStocktakeById,
  cancelStocktake,
  getStocktakeItems,
  updateStocktakeItem,
  bulkUpdateStocktakeItems,
  exportStocktakeSheet,
  importStocktakeSheet,
  submitStocktake,
  resolveStocktakeItems,
} from "../../controller/admin/stockTake";
import { uploadExcelFile } from "../../utils/uploadFile";
import { authorizePermissions } from "../../middlewares/haspremission";

const route = Router();

route.get("/",authorizePermissions("stocktake","View"), catchAsync(getStocktakes));
route.get("/:id",authorizePermissions("stocktake","View"), catchAsync(getStocktakeById));
route.post("/", authorizePermissions("stocktake","Add"), catchAsync(createStocktake));
route.delete("/:id", authorizePermissions("stocktake","Delete"), catchAsync(cancelStocktake));

route.get("/:id/items", authorizePermissions("stocktake","View"), catchAsync(getStocktakeItems));
route.patch("/:id/items/:itemId", authorizePermissions("stocktake","Edit"), catchAsync(updateStocktakeItem));
route.put("/:id/items", authorizePermissions("stocktake","Edit"), catchAsync(bulkUpdateStocktakeItems));

route.get("/:id/export", authorizePermissions("stocktake","View"), catchAsync(exportStocktakeSheet));
route.post(
  "/:id/import",
  uploadExcelFile().single("file"),
  authorizePermissions("stocktake","Edit"),
  catchAsync(importStocktakeSheet)
);

route.post("/:id/submit", authorizePermissions("stocktake","Edit"), catchAsync(submitStocktake));
route.post("/:id/resolve", authorizePermissions("stocktake","Edit"), catchAsync(resolveStocktakeItems));
export default route;
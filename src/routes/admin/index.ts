import { Router } from "express";
import authRouter from "./auth";
import brandRouter from "./brand";
import AdminRouter from "./Admin";
import CategoryRouter from "./category";
import permissionRouter from './permission';
import productRouter from './products';
import CashierShiftRouteer from "./cashiershifts"
import supplierRouter from './suppliers';
import WarehouseRouter from "./Warehouse"
import CouriersRouter from "./Couriers"
import paymentMethodRouter from "./payment_method";
import expensesRouter from './POS/expenses'
import CouponsRouter from './coupons'
import DepartmentRouter from './departments'
import AdjustmentRouter from './adjustments'
import BankAccountRouter from "./Financial_Account";
import CountryRouter from "./Country";
import pandelRouter from "./pandels";
import CityRouter from "./City";
import Category_MaterialRouter from "./Category_Material";
import PurchaseRouter from "./Purchase";
import discountRouter from "./discount";
import StockRouter from "./stocks";
import ZoneRouter from "./Zone";
import CurrencyRouter from "./Currency";
import generatelabelRouter from "./generatelabel";
import TaxesRouter from "./Taxes";
import VariationRouter from "./Variation";
import trnsferRouter from "./Transfer"
import RecipeRouter from "./Recipe"
import PointRouter from "./points"
import redeem_PointsRouter from "./redeem_Points"
import Product_warehouseRouter from "./product_warehouse"
import SelectReasonRouter from "./adjustmentsreason";
import SaleRouter from "./POS/POSRoutes"
import CustomerGroupRouter from "./POS/customerGroupRoutes"
import CustomerRouter from "./customerRoutes"
import GiftCardRouter from "./POS/giftCardRoutes"
import PosHomeRouter from "./POS/POSHomeRoutes"
import POSBookingRouter from "./POS/BookingRoutes"
import CashierShiftRouter from "./POS/CashierShiftRoutes"
import BookingRouter from "./Booking"
import PopupRouter from "./Popup"
import ReturnRouter from "./POS/ReturnSaleRoutes"
import qztrayRouter from "./Qztray"
import paymentRouter from "./payments"
import OffersRouter from "./Offers"
import CashierRouter from "./cashier"
import UnitsRouter from "./units"
import ExpensecategoryRouter from "./expensecategory" //Rputer
import PaymobRouter from "./Paymob"
import ExpenseAdminRouter from "./expensesAdmin"
import notificationRoutrt from "./notifications"
import productReportRouter from "./productReport"
import productMovementRouter from "./productMovement"
import { authenticated } from "../../middlewares/authenticated";
import { authorizeRoles } from "../../middlewares/authorized";
import { enforceWarehouseScope } from "../../middlewares/warehouseScope";
import RevenueRouter from "./Revenue";
import DashboardRouter from "./dsashboard";
import ReturnPurchaseRouter from "./returnPurchase";
import finicial_reportRouter from "./finicialaccountReport";
import orderRouter from "./orders";
import versionUpdaterRouter from "./versionUpdater";
import DecimalSettingRouter from "./DecimalSetting";
import BannerRouter from "./Banner";
import ServiceFeeRouter from "./ServiceFee";
import ShippingRouter from "./Shipping";
import tenantInfoRouter from "./tenantInfo";
import onlineOrderRouter from "./onlineOrders";
import  GeideaRouter from "./Geidea";
import PayableRouter from "./Payable";
import ReceivableRouter from "./Receivable";
import AccountingLedgerRouter from "./AccountingLedger";
import FawryRouter from "./Fawry";
import orderTypeRouter from "./ordertype";
import ProfileRouter from "./ProfileRoutes";
import stockTakeRouter from "./stockTake";
import wastedRouter from "./wasted";
import storeSettingsRoutes from "./storeSettings";
export const route = Router();

route.use("/tenant-info", tenantInfoRouter)

route.use("/auth", authRouter);
route.use(authenticated, authorizeRoles("admin", "superadmin"));
route.use(enforceWarehouseScope);
route.use("/profile", ProfileRouter);
route.use("/brand", brandRouter);
route.use("/admin", AdminRouter);
route.use("/permission", permissionRouter);
route.use("/category", CategoryRouter);
route.use("/product", productRouter);
route.use("/expenseAdmin", ExpenseAdminRouter)
route.use("/units", UnitsRouter)
route.use("/cashier", CashierRouter)
route.use("/supplier", supplierRouter);
route.use("/recipe", RecipeRouter);
route.use("/qztray", qztrayRouter);
route.use("/warehouse", WarehouseRouter)
route.use("/expensecategory", ExpensecategoryRouter)
route.use("/discount", discountRouter)
route.use("/courier", CouriersRouter)
route.use("/payment_method", paymentMethodRouter)
route.use("/expense", expensesRouter)
route.use("/pandel", pandelRouter)
route.use("/cashiershift", CashierShiftRouteer)
route.use("/coupon", CouponsRouter)
route.use("/department", DepartmentRouter)
route.use("/adjustment", AdjustmentRouter)
route.use("/label", generatelabelRouter);
route.use("/bank_account", BankAccountRouter)
route.use("/country", CountryRouter);
route.use("/city", CityRouter);
route.use("/purchase", PurchaseRouter);
route.use("/stock", StockRouter);
route.use("/zone", ZoneRouter);
route.use("/currency", CurrencyRouter);
route.use("/dashboard", DashboardRouter);
route.use("/taxes", TaxesRouter);
route.use("/category_material", Category_MaterialRouter);
route.use("/variation", VariationRouter);
route.use("/transfer", trnsferRouter)
route.use("/product_warehouse", Product_warehouseRouter)
route.use("/selectreason", SelectReasonRouter)
route.use("/pos", SaleRouter)
route.use("/pos_customer", CustomerGroupRouter)
route.use("/customer", CustomerRouter)
route.use("/gift-card", GiftCardRouter)
route.use("/pos-home", PosHomeRouter)
route.use("/pos-booking", POSBookingRouter)
route.use("/cashier-shift", CashierShiftRouter)
route.use("/point", PointRouter)
route.use("/redeem-points", redeem_PointsRouter)
route.use("/popup", PopupRouter)
route.use("/offer", OffersRouter)
route.use("/paymob", PaymobRouter)
route.use("/payment", paymentRouter)
route.use("/notification", notificationRoutrt)

route.use("/geidea", GeideaRouter)
route.use("/booking", BookingRouter)
route.use("/return-sale", ReturnRouter)
route.use("/return-purchase", ReturnPurchaseRouter)
route.use("/revenue", RevenueRouter);
route.use("/orders", orderRouter);
route.use("/product-report", productReportRouter)
route.use("/product-movement", productMovementRouter)
route.use("/finicial-report", finicial_reportRouter)
route.use("/version-updater", versionUpdaterRouter)
route.use("/decimal-setting", DecimalSettingRouter)
route.use("/banner", BannerRouter)
route.use("/service-fees", ServiceFeeRouter)
route.use("/shipping", ShippingRouter)
route.use("/online-orders", onlineOrderRouter)
route.use("/payable", PayableRouter)
route.use("/receivable", ReceivableRouter)
route.use("/ledger", AccountingLedgerRouter)
route.use("/fawry", FawryRouter)
route.use("/order-type", orderTypeRouter);
route.use("/stocktake", stockTakeRouter);
route.use("/wasted", wastedRouter);
route.use("/store-settings", storeSettingsRoutes);


export default route;

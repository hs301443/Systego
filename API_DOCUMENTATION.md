# 📡 Systego API Reference - الدليل الشامل لجميع المسارات والنموذج الإشاري

> **تاريخ الإنشاء:** سبتمبر 2026  
> **هدف المستند:** التوثيق التقني التفصيلي المكتمل لكافة المسارات (**API Endpoints**) الخاصة بنظام **Systego**، متضمنة المسارات الإدارية، مسارات نقاط البيع، مسارات المزامنة، ومسارات المتجر الإلكتروني.

---

## 📑 فهرس المسارات
1. [نظرة عامة والترويسة القياسية (Headers & Base URL)](#1-نظرة-عامة-والترويسة-القياسية-headers--base-url)
2. [مسارات المزامنة المباشرة وأوفلاين POS Sync APIs (`/api/sync`)](#2-مسارات-المزامنة-المباشرة-وأوفلاين-pos-sync-apis-apisync)
3. [مسارات المتجر الإلكتروني للعملاء Storefront APIs (`/api/store`)](#3-مسارات-المتجر-الإلكتروني-للعملاء-storefront-apis-apistore)
4. [مسارات لوحة الإدارة ونقاط البيع Admin APIs (`/api/admin`)](#4-مسارات-لوحة-الإدارة-ونقاط-البيع-admin-apis-apiadmin)
5. [نموذج الاستجابات القياسي والأخطاء (Response & Error Formats)](#5-نموذج-الاستجابات-القياسي-والأخطاء-response--error-formats)

---

## 1. نظرة عامة والترويسة القياسية (Headers & Base URL)

* **Base URL:** `http://localhost:3000/api` (أو النطاق المعتمد للمؤسسة)
* **المصادقة (Authentication):** تعتمد المسارات المحمية على توكن JWT ويجب إرساله في رأس الطلب كالتالي:
  ```text
  Authorization: Bearer <YOUR_JWT_TOKEN>
  ```
* **تحديد نطاق الفرع/المخزن (Warehouse Scoping):** يتم قيود المسارات تلقائياً بحسب `warehouse_id` المربوط بالمستخدم المحقق، أو عبر الاستعلام `?warehouse_id=xxx`.

---

## 2. مسارات المزامنة المباشرة وأوفلاين POS Sync APIs (`/api/sync`)

تُستخدم هذه المسارات من قِبل تطبيق نقاط البيع (POS) المحلي للعمل أوفلاين والمزامنة التلقائية مع السيرفر الرئيسي.

| Endpoint | Method | Auth | Description & Payload |
| :--- | :--- | :--- | :--- |
| `/api/sync/bootstrap/:table` | `GET` | Bearer | جلب النسخة المبدئية الكاملة لجدول محدد (مثال: `Product`, `Customer`). يتضمن الـ Query: `?cursor=xxx` للتحميل المجزأ (Pagination). |
| `/api/sync/push` | `POST` | Bearer | رفع التغييرات التي تمت على نقاط البيع أوفلاين.  <br>**Body:** `{ clientId: "pos-1", changes: [{ id, table_name, record_id, op: "insert"|"update"|"delete", payload }] }` |
| `/api/sync/pull` | `POST / GET` | Bearer | جلب التغييرات التراكمية الجديدة من السيرفر لجميع الأجهزة أوفلاين. <br>**Query:** `?since=ISO_DATE&clientId=pos-1` |

---

## 3. مسارات المتجر الإلكتروني للعملاء Storefront APIs (`/api/store`)

المسارات المخصصة لمتجر وتطبيق العملاء التجاري (E-Commerce Store).

### 3.1. المصادقة والعميل (`/api/store/auth`)
| Endpoint | Method | Auth | Description |
| :--- | :--- | :--- | :--- |
| `/api/store/auth/register` | `POST` | None | تسجيل حساب جديد للعميل (`name`, `email`, `password`, `phone`). |
| `/api/store/auth/login` | `POST` | None | تسجيل الدخول بريد/كلمة سر والحصول على JWT Token. |
| `/api/store/auth/google` | `POST` | None | تسجيل الدخول بواسطة Google OAuth. |
| `/api/store/auth/apple` | `POST` | None | تسجيل الدخول بواسطة Apple Sign-In. |
| `/api/store/auth/profile` | `GET` | Bearer | جلب بيانات العميل الشخصية. |
| `/api/store/auth/profile` | `PUT` | Bearer | تحديث البيانات الشخصية للعميل. |

### 3.2. الكتالوج والتصفح (`/api/store`)
| Endpoint | Method | Auth | Description |
| :--- | :--- | :--- | :--- |
| `/api/store/category` | `GET` | None | عرض قائمة الأقسام والتصنيفات المتاحة بالمتجر. |
| `/api/store/product` | `GET` | None | عرض المنتجات مع البحث والفلترة حسب القسم أو العلامة التجاريه (`?search=&category_id=&page=`). |
| `/api/store/product/:id` | `GET` | None | جلب تفاصيل منتج محدد مع متغيراته وأسعاره. |
| `/api/store/brand` | `GET` | None | عرض العلامات التجارية المتاحة. |
| `/api/store/banner` | `GET` | None | عرض البانرات الإعلانية الرئيسية بالمتجر. |
| `/api/store/tenant-info` | `GET` | None | جلب بيانت وتفاصيل صاحب البزنس والشعار. |
| `/api/store/store-settings` | `GET` | None | جلب إعدادات وتصميم المتجر الإلكتروني. |

### 3.3. السلة، العناوين، والطلبات (`/api/store`)
| Endpoint | Method | Auth | Description |
| :--- | :--- | :--- | :--- |
| `/api/store/wishlist` | `GET / POST / DELETE` | Bearer | إدارة قائمة المنتجات المفضلة للعميل. |
| `/api/store/address` | `GET` | Bearer | جلب عناوين التوصيل المسجلة للعميل. |
| `/api/store/address` | `POST` | Bearer | إضافة عنوان توصيل جديد. |
| `/api/store/address/:id` | `PUT / DELETE` | Bearer | تعديل أو حذف عنوان توصيل. |
| `/api/store/cart` | `GET` | Bearer | عرض محتويات سلة التسوق الخاصة بالعميل. |
| `/api/store/cart` | `POST` | Bearer | إضافة منتج إلى سلة التسوق. |
| `/api/store/cart/item/:id` | `PUT / DELETE` | Bearer | تعديل كمية منتج أو حذفه من السلة. |
| `/api/store/cart/clear` | `DELETE` | Bearer | تفريغ سلة التسوق بالكامل. |
| `/api/store/order` | `POST` | Bearer | إنشاء طلب جديد وسداده من المتجر الإلكتروني. |
| `/api/store/order` | `GET` | Bearer | عرض قائمة طلبات العميل السابقة وحالاتها. |
| `/api/store/order/:id` | `GET` | Bearer | عرض تفاصيل طلب محدد برقم الطلب. |
| `/api/store/order/:id/cancel` | `PUT` | Bearer | إلغاء طلب تحت التنفيذ. |

---

## 4. مسارات لوحة الإدارة ونقاط البيع Admin APIs (`/api/admin`)

تتطلب جميع المسارات التالية التوكن `Bearer Token` وأن يكون دور المستخدم `admin` أو `superadmin` أو `cashier` مع فحص الصلاحية والنطاق.

### 4.1. مصادقة الإدارة والمستخدمين (`/api/admin/auth` & `/api/admin/admin`)
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/admin/auth/login` | `POST` | تسجيل دخول الأدمن/الكاشير إلى لوحة التحكم أو الـ POS. |
| `/api/admin/profile` | `GET / PUT` | عرض وتحديث بيانات حساب الأدمن الحالي. |
| `/api/admin/admin` | `GET` | قائمة جميع مستخدمي النظام والإدارة. |
| `/api/admin/admin` | `POST` | إنشاء حساب أدمن أو موظف جديد وتعيين الصلاحيات والمخزن. |
| `/api/admin/admin/:id` | `GET / PUT / DELETE` | عرض، تعديل، أو حذف حساب موظف/أدمن. |
| `/api/admin/permission` | `GET / POST / PUT` | إدارة الأدوار المخصصة (Roles) وصلاحيات الموديولات. |

### 4.2. نقاط البيع والورديات POS & Cashier Shifts (`/api/admin/pos` & `/pos-home` & `/cashier-shift`)
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/admin/cashier-shift/open` | `POST` | فتح وردية جديدة للكاشير برصيد افتتاح معين. |
| `/api/admin/cashier-shift/close` | `POST` | إغلاق الوردية الحالية وحساب الإجماليات والفروقات. |
| `/api/admin/cashier-shift/current` | `GET` | جلب بيانات الوردية المفتوحة حالياً للكاشير. |
| `/api/admin/pos-home` | `GET` | جلب البيانات السريعة لشاشة الـ POS (المنتجات، التصنيفات، العروض السريعة). |
| `/api/admin/pos` | `POST` | **عملية البيع الرئيسية:** إنشاء فاتورة مبيعات جديدة وخصم المخزون والمدفوعات. |
| `/api/admin/pos` | `GET` | عرض قائمة فواتير مبيعات نقاط البيع. |
| `/api/admin/pos/:id` | `GET` | جلب تفاصيل فاتورة بيع محددة وطباعتها. |
| `/api/admin/return-sale` | `POST` | عمل مرتجع لمبيعات POS وإعادة الكمية للمخزن. |
| `/api/admin/gift-card` | `GET / POST / PUT` | إدارة وإصدار كروت الهدايا وفحص رصيدها. |
| `/api/admin/pos-booking` | `GET / POST / PUT` | إدارة حجز الطاولات والمواعيد داخل الـ POS. |
| `/api/admin/expense` | `POST` | تسجيل مصروف نثري مباشر من درج الكاشير أثناء الوردية. |

### 4.3. إدارة المخازن والمنتجات Inventory & Products (`/api/admin`)
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/admin/product` | `GET / POST` | عرض قائمة المنتجات أو إضافة منتج جديد بالنظام. |
| `/api/admin/product/:id` | `GET / PUT / DELETE` | عرض تفاصيل أو تعديل أو حذف منتج. |
| `/api/admin/product_warehouse` | `GET / PUT` | متابعة وتعديل كميات المنتج والحد الأدنى بكل مخزن فرعي. |
| `/api/admin/category` | `GET / POST / PUT / DELETE` | إدارة أقسام المنتجات والهيكل الشجري. |
| `/api/admin/brand` | `GET / POST / PUT / DELETE` | إدارة العلامات التجارية. |
| `/api/admin/units` | `GET / POST / PUT / DELETE` | إدارة وحدات القياس (كيلو، قطعة، إلخ). |
| `/api/admin/warehouse` | `GET / POST / PUT / DELETE` | إنشاء وإدارة الفروع والمستودعات. |
| `/api/admin/transfer` | `GET / POST` | إنشاء أمر تحويل بضاعة بين مستودعين. |
| `/api/admin/transfer/:id/status` | `PUT` | موافقة أو رفض طلب التحويل وإعادة توجيه الكميات. |
| `/api/admin/stocktake` | `GET / POST` | بدء وإنشاء عملية جرد مخزني (Stock Take). |
| `/api/admin/adjustment` | `GET / POST` | تظبيط كميات المخزون يدوياً وتسجيل الأسباب. |
| `/api/admin/wasted` | `GET / POST` | إثبات وتخريد المنتجات الهالكة والتالفة. |
| `/api/admin/label` | `POST` | توليد وطباعة ملصقات الباركود للمنتجات. |

### 4.4. المشتريات والموردين Purchasing & Suppliers (`/api/admin`)
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/admin/supplier` | `GET / POST / PUT / DELETE` | إدارة بيانات الموردين وحساباتهم المستحقة. |
| `/api/admin/purchase` | `GET / POST` | إنشـاء فاتورة مشتريات جديدة وتغدية المستودع بالكميات. |
| `/api/admin/purchase/:id` | `GET / PUT / DELETE` | عرض وتعديل تفاصيل فاتورة المشتريات. |
| `/api/admin/return-purchase` | `GET / POST` | إجراء مرتجع مشتريات للمورد وتخفيض الكميات. |

### 4.5. التصنيع والمواد الخام Recipe & BOH (`/api/admin`)
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/admin/category_material` | `GET / POST / PUT` | إدارة تصنيفات المواد الخام. |
| `/api/admin/recipe` | `GET / POST / PUT / DELETE` | إعداد وصفات المنتجات وربط المنتج بالمكونات الخام لخصمها التلقائي. |

### 4.6. المالية والحسابات والتقارير Finance & Reports (`/api/admin`)
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/admin/bank_account` | `GET / POST / PUT` | إدارة الحسابات البنكية والخزائن المالية ورصيدها. |
| `/api/admin/ledger` | `GET` | عرض دفتر الأستاذ العام والقيود المحاسبية. |
| `/api/admin/revenue` | `GET / POST` | تسجيل الإيرادات الأخرى وتقسيماتها. |
| `/api/admin/expenseAdmin` | `GET / POST` | إدارة المصاريف الإدارية العامة والتشغيلية. |
| `/api/admin/payable` | `GET` | عرض كشف حساب المبالغ المستحقة للدفع (الدائنون). |
| `/api/admin/receivable` | `GET` | عرض كشف حساب المبالغ المستحقة للقبض (المدينون). |
| `/api/admin/finicial-report` | `GET` | جلب التقارير المالية (قائمة الدخل، الأرباح والخسائر). |
| `/api/admin/product-report` | `GET` | تقارير أداء المنتجات الأكثر بيعاً والأبطأ حركة. |
| `/api/admin/product-movement` | `GET` | تقرير سجل حركة المنتج الكلي منذ إدخاله. |
| `/api/admin/dashboard` | `GET` | مؤشرات وإحصائيات لوحة التحكم الرئيسية (Dashboard Metrics). |

### 4.7. الإعدادات، التوصيل، والتكاملات Settings & Integrations (`/api/admin`)
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/admin/tenant-info` | `GET / PUT` | تحديث بيانات المؤسسة والشعار الرئيسي. |
| `/api/admin/courier` | `GET / POST / PUT` | إدارة شركات التوصيل والشحن. |
| `/api/admin/country` & `/city` & `/zone` | `GET / POST / PUT` | إدارة الدول والمناطق والمحافظات وتكاليف التوصيل. |
| `/api/admin/taxes` | `GET / POST / PUT` | إعداد نسبة ضريبة القيمة المضافة. |
| `/api/admin/service-fees` | `GET / POST / PUT` | إعداد رسوم الخدمة المضافة للطلبات. |
| `/api/admin/currency` | `GET / POST / PUT` | إعداد العملات وأسعار الصرف. |
| `/api/admin/qztray` | `GET / POST` | إعدادات ومسارات الطباعة الحرارية عبر QZ Tray. |
| `/api/admin/paymob` & `/geidea` & `/fawry` | `POST / PUT` | إعدادات وتأكيد مدفوعات بوابات الدفع الإلكتروني. |

---

## 5. نموذج الاستجابات القياسي والأخطاء (Response & Error Formats)

### 5.1. هيكل الاستجابة الناجحة القياسي (Success Response)
تستخدم جميع الكنترولرات الدالة المساعدة [`SuccessResponse`](file:///c:/Users/DELL/Desktop/work/Systego/src/utils/response.ts):
```json
{
  "status": "success",
  "data": { ... },
  "message": "Operation completed successfully"
}
```

### 5.2. هيكل استجابة الأخطاء القياسي (Error Response)
تتم معالجته مركزياً بواسطة [`errorHandler.ts`](file:///c:/Users/DELL/Desktop/work/Systego/src/middlewares/errorHandler.ts):
```json
{
  "status": "error",
  "statusCode": 400,
  "message": "Bad Request: Detailed error message explanation"
}
```

---
> **تم إعداد دليل الـ APIs بشكل مكتمل ودقيق لخدمة فريق التطوير والتكامل.**

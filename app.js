"use strict";

/* ==========================================
   ديرتي | حسابات السائقين اليومية
   إدارة الفواتير والأصناف والتقارير والأرشيف
========================================== */

const DB_KEY = "deerty_mobile_accounts_v1";
const WHATSAPP_NUMBER = "966536803598";

const $ = id => document.getElementById(id);

const money = value =>
  (Number(value) || 0).toLocaleString("ar-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " ر.س";

const number = value => Number(value) || 0;

const todayISO = () => {
  const d = new Date();

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
};

const makeId = prefix =>
  prefix + "_" + Date.now().toString(36) + "_" +
  Math.random().toString(36).slice(2, 8);

const escapeHTML = value =>
  String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

function createInitialDB() {
  return {
    version: 1,
    drivers: [],
    items: [],
    invoices: [],
    archives: [],
    dayClosures: []
  };
}

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);

    if (!raw) return createInitialDB();

    const data = JSON.parse(raw);

    return {
      ...createInitialDB(),
      ...data,
      drivers: Array.isArray(data.drivers) ? data.drivers : [],
      items: Array.isArray(data.items) ? data.items : [],
      invoices: Array.isArray(data.invoices) ? data.invoices : [],
      archives: Array.isArray(data.archives) ? data.archives : [],
      dayClosures: Array.isArray(data.dayClosures)
        ? data.dayClosures
        : []
    };
  } catch (error) {
    console.error(error);

    alert(
      "تعذر قراءة البيانات المحفوظة. " +
      "لا تحذف بيانات المتصفح قبل محاولة استعادة نسخة احتياطية."
    );

    return createInitialDB();
  }
}

let db = loadDB();
let toastTimer = null;
let lastReportGroups = [];


/* ==========================================
   الحفظ والتنبيهات
========================================== */

function saveDB() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    return true;
  } catch (error) {
    console.error(error);

    alert(
      "تعذر حفظ البيانات. قد تكون مساحة التخزين ممتلئة. " +
      "صدّر نسخة احتياطية وتحقق من مساحة المتصفح."
    );

    return false;
  }
}

function toast(message) {
  const element = $("toast");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    element.classList.remove("show");
  }, 2800);
}

function confirmAction(message) {
  return window.confirm(message);
}

function setTodayDate() {
  const date = todayISO();

  $("todayDate").textContent = new Date()
    .toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });

  $("invoiceDate").value = date;
  $("reportDate").value = date;
}


/* ==========================================
   التنقل بين الصفحات
========================================== */

function showPage(pageName) {
  const target = $("page-" + pageName);

  if (!target) return;

  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  target.classList.add("active");

  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageName &&
      button.classList.contains("nav-item")
    );
  });

  if (pageName === "dashboard") renderDashboard();

  if (pageName === "invoice") {
    populateSelects();

    if (!$("invoiceItems").children.length) {
      addInvoiceItemRow();
    }
  }

  if (pageName === "drivers") renderDrivers();

  if (pageName === "items") renderItems();

  if (pageName === "reports") {
    populateSelects();
    generateReport();
  }

  if (pageName === "archive") {
    populateSelects();
    renderArchive();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", event => {
  const pageButton = event.target.closest("[data-page]");

  if (pageButton) {
    showPage(pageButton.dataset.page);
  }

  if (event.target.closest("[data-close-modal]")) {
    closeModal();
  }
});


/* ==========================================
   إدارة السائقين
========================================== */

function renderDrivers() {
  const container = $("driversList");

  $("driversCount").textContent = db.drivers.length;

  if (!db.drivers.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span>🚚</span>
        <p>لم تتم إضافة أي سائق حتى الآن.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = db.drivers.map(driver => {
    const invoiceCount = db.invoices.concat(db.archives)
      .filter(invoice => invoice.driverId === driver.id).length;

    return `
      <article class="data-card">
        <div class="data-card-header">
          <div>
            <h4>${escapeHTML(driver.name)}</h4>
            <p>📱 ${escapeHTML(driver.phone || "لا يوجد رقم مسجل")}</p>
            <p>عدد الفواتير: ${invoiceCount}</p>
          </div>
        </div>

        <div class="data-card-actions">
          <button
            class="edit-button"
            type="button"
            data-edit-driver="${escapeHTML(driver.id)}">
            ✏️ تعديل
          </button>

          <button
            class="delete-button"
            type="button"
            data-delete-driver="${escapeHTML(driver.id)}">
            حذف السائق
          </button>
        </div>
      </article>
    `;
  }).join("");
}

$("driverForm").addEventListener("submit", event => {
  event.preventDefault();

  const id = $("driverId").value;

  const name = $("driverName").value.trim();
  const phone = $("driverPhone").value.trim();

  if (!name) {
    toast("اكتب اسم السائق أولًا.");
    return;
  }

  const duplicate = db.drivers.some(driver =>
    driver.name.trim().toLowerCase() === name.toLowerCase() &&
    driver.id !== id
  );

  if (duplicate) {
    toast("اسم السائق مسجل مسبقًا.");
    return;
  }

  if (id) {
    const driver = db.drivers.find(item => item.id === id);

    if (!driver) return;

    driver.name = name;
    driver.phone = phone;

    db.invoices.concat(db.archives).forEach(invoice => {
      if (invoice.driverId === id) {
        invoice.driverName = name;
      }
    });

    toast("تم تعديل بيانات السائق.");
  } else {
    db.drivers.push({
      id: makeId("driver"),
      name,
      phone,
      createdAt: new Date().toISOString()
    });

    toast("تمت إضافة السائق.");
  }

  if (!saveDB()) return;

  resetDriverForm();
  refreshAll();
});

function resetDriverForm() {
  $("driverForm").reset();
  $("driverId").value = "";

  $("saveDriverButton").textContent = "حفظ السائق";
  $("cancelDriverEdit").classList.add("hidden");
}

$("cancelDriverEdit").addEventListener("click", resetDriverForm);

document.addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit-driver]");

  if (editButton) {
    const driver = db.drivers.find(
      item => item.id === editButton.dataset.editDriver
    );

    if (!driver) return;

    $("driverId").value = driver.id;
    $("driverName").value = driver.name;
    $("driverPhone").value = driver.phone || "";

    $("saveDriverButton").textContent = "حفظ التعديلات";
    $("cancelDriverEdit").classList.remove("hidden");

    $("driverName").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const deleteButton = event.target.closest("[data-delete-driver]");

  if (deleteButton) {
    const id = deleteButton.dataset.deleteDriver;

    const used = db.invoices.concat(db.archives).some(
      invoice => invoice.driverId === id
    );

    if (used) {
      toast("لا يمكن حذف سائق لديه فواتير. احتفظ بسجله للمراجعة.");
      return;
    }

    if (!confirmAction("هل تريد حذف هذا السائق؟")) return;

    db.drivers = db.drivers.filter(driver => driver.id !== id);

    if (saveDB()) {
      refreshAll();
      toast("تم حذف السائق.");
    }
  }
});


/* ==========================================
   إدارة الأصناف
========================================== */

function renderItems() {
  const container = $("itemsList");

  $("itemsCount").textContent = db.items.length;

  if (!db.items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span>📦</span>
        <p>أضف الأصناف وأسعارها للبدء بإصدار الفواتير.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = db.items.map(item => `
    <article class="data-card">
      <div class="data-card-header">
        <div>
          <h4>${escapeHTML(item.name)}</h4>
          <p>سعر الوحدة: ${money(item.price)}</p>
          <p>الوحدة: ${escapeHTML(item.unit || "حبة")}</p>
        </div>
      </div>

      <div class="data-card-actions">
        <button
          class="edit-button"
          type="button"
          data-edit-item="${escapeHTML(item.id)}">
          ✏️ تعديل
        </button>

        <button
          class="delete-button"
          type="button"
          data-delete-item="${escapeHTML(item.id)}">
          حذف الصنف
        </button>
      </div>
    </article>
  `).join("");
}

$("itemForm").addEventListener("submit", event => {
  event.preventDefault();

  const id = $("itemId").value;
  const name = $("itemName").value.trim();
  const price = Number($("itemPrice").value);
  const unit = $("itemUnit").value.trim() || "حبة";

  if (!name || !Number.isFinite(price) || price < 0) {
    toast("تحقق من اسم الصنف وسعره.");
    return;
  }

  const duplicate = db.items.some(item =>
    item.name.trim().toLowerCase() === name.toLowerCase() &&
    item.id !== id
  );

  if (duplicate) {
    toast("اسم الصنف مسجل مسبقًا.");
    return;
  }

  if (id) {
    const item = db.items.find(entry => entry.id === id);

    if (!item) return;

    item.name = name;
    item.price = price;
    item.unit = unit;

    toast("تم تعديل الصنف.");
  } else {
    db.items.push({
      id: makeId("item"),
      name,
      price,
      unit,
      createdAt: new Date().toISOString()
    });

    toast("تمت إضافة الصنف.");
  }

  if (!saveDB()) return;

  resetItemForm();
  refreshAll();
});

function resetItemForm() {
  $("itemForm").reset();
  $("itemId").value = "";

  $("saveItemButton").textContent = "حفظ الصنف";
  $("cancelItemEdit").classList.add("hidden");
}

$("cancelItemEdit").addEventListener("click", resetItemForm);

document.addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit-item]");

  if (editButton) {
    const item = db.items.find(
      entry => entry.id === editButton.dataset.editItem
    );

    if (!item) return;

    $("itemId").value = item.id;
    $("itemName").value = item.name;
    $("itemPrice").value = item.price;
    $("itemUnit").value = item.unit || "حبة";

    $("saveItemButton").textContent = "حفظ التعديلات";
    $("cancelItemEdit").classList.remove("hidden");

    $("itemName").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const deleteButton = event.target.closest("[data-delete-item]");

  if (deleteButton) {
    const id = deleteButton.dataset.deleteItem;

    if (!confirmAction(
      "هل تريد حذف هذا الصنف من قائمة الأصناف؟\n" +
      "لن تتغير الفواتير القديمة المحفوظة."
    )) return;

    db.items = db.items.filter(item => item.id !== id);

    if (saveDB()) {
      refreshAll();
      toast("تم حذف الصنف من القائمة.");
    }
  }
});


/* ==========================================
   القوائم المنسدلة
========================================== */

function populateSelects() {
  const driverSelects = [
    $("invoiceDriver"),
    $("reportDriver"),
    $("archiveDriver")
  ];

  driverSelects.forEach(select => {
    if (!select) return;

    const previousValue = select.value;

    const isAllSelect =
      select.id === "reportDriver" ||
      select.id === "archiveDriver";

    select.innerHTML = isAllSelect
      ? '<option value="all">جميع السائقين</option>'
      : '<option value="">اختر السائق</option>';

    db.drivers.forEach(driver => {
      const option = document.createElement("option");

      option.value = driver.id;
      option.textContent = driver.name;

      select.appendChild(option);
    });

    if ([...select.options].some(
      option => option.value === previousValue
    )) {
      select.value = previousValue;
    }
  });
}


/* ==========================================
   إنشاء فاتورة صرف
========================================== */

function addInvoiceItemRow(selectedItemId = "", quantity = 1, price = null) {
  const container = $("invoiceItems");
  const row = document.createElement("div");

  row.className = "invoice-item-row";

  row.innerHTML = `
    <div class="invoice-item-top">
      <strong>صنف الفاتورة</strong>

      <button
        type="button"
        class="remove-item-button"
        data-remove-invoice-item>
        حذف
      </button>
    </div>

    <div class="invoice-item-fields">
      <div class="form-group">
        <label>الصنف</label>
        <select class="line-item-select" required>
          <option value="">اختر الصنف</option>
        </select>
      </div>

      <div class="form-group">
        <label>الكمية</label>
        <input
          class="line-quantity"
          type="number"
          min="0.01"
          step="0.01"
          inputmode="decimal"
          value="${number(quantity) || 1}"
          required>
      </div>

      <div class="form-group">
        <label>سعر الوحدة (ر.س)</label>
        <input
          class="line-price"
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          value="${price === null ? "" : number(price)}"
          placeholder="0.00"
          required>
      </div>

      <div class="form-group">
        <label>إجمالي الصنف</label>
        <input
          class="line-total"
          type="text"
          value="0.00 ر.س"
          readonly>
      </div>
    </div>

    <div class="invoice-item-subtotal">
      <span>المبلغ</span>
      <strong class="line-total-label">0.00 ر.س</strong>
    </div>
  `;

  const select = row.querySelector(".line-item-select");

  db.items.forEach(item => {
    const option = document.createElement("option");

    option.value = item.id;
    option.textContent = `${item.name} — ${money(item.price)}`;

    select.appendChild(option);
  });

  select.value = selectedItemId;

  if (selectedItemId && price === null) {
    const item = db.items.find(entry => entry.id === selectedItemId);

    if (item) row.querySelector(".line-price").value = item.price;
  }

  container.appendChild(row);

  calculateInvoiceRow(row);
  calculateInvoiceGrandTotal();
}

$("addInvoiceItem").addEventListener("click", () => {
  addInvoiceItemRow();
});

$("invoiceItems").addEventListener("change", event => {
  const row = event.target.closest(".invoice-item-row");

  if (!row) return;

  if (event.target.classList.contains("line-item-select")) {
    const item = db.items.find(
      entry => entry.id === event.target.value
    );

    if (item) {
      row.querySelector(".line-price").value = item.price;
    }
  }

  calculateInvoiceRow(row);
  calculateInvoiceGrandTotal();
});

$("invoiceItems").addEventListener("input", event => {
  const row = event.target.closest(".invoice-item-row");

  if (!row) return;

  calculateInvoiceRow(row);
  calculateInvoiceGrandTotal();
});

$("invoiceItems").addEventListener("click", event => {
  const removeButton = event.target.closest("[data-remove-invoice-item]");

  if (!removeButton) return;

  const rows = $("invoiceItems").querySelectorAll(".invoice-item-row");

  if (rows.length <= 1) {
    toast("يجب إبقاء صنف واحد على الأقل في الفاتورة.");
    return;
  }

  removeButton.closest(".invoice-item-row").remove();

  calculateInvoiceGrandTotal();
});

function calculateInvoiceRow(row) {
  const quantity = number(row.querySelector(".line-quantity").value);
  const price = number(row.querySelector(".line-price").value);

  const total = quantity * price;

  row.querySelector(".line-total").value = money(total);
  row.querySelector(".line-total-label").textContent = money(total);
}

function calculateInvoiceGrandTotal() {
  let total = 0;

  document.querySelectorAll(".invoice-item-row").forEach(row => {
    const quantity = number(row.querySelector(".line-quantity").value);
    const price = number(row.querySelector(".line-price").value);

    total += quantity * price;
  });

  $("invoiceGrandTotal").textContent = money(total);

  return total;
}

$("invoiceForm").addEventListener("submit", event => {
  event.preventDefault();

  const driverId = $("invoiceDriver").value;
  const date = $("invoiceDate").value;
  const notes = $("invoiceNotes").value.trim();

  const driver = db.drivers.find(item => item.id === driverId);

  if (!driver) {
    toast("اختر السائق أولًا.");
    return;
  }

  if (!date) {
    toast("حدد تاريخ الفاتورة.");
    return;
  }

  const rows = [
    ...$("invoiceItems").querySelectorAll(".invoice-item-row")
  ];

  const invoiceItems = [];

  for (const row of rows) {
    const itemId = row.querySelector(".line-item-select").value;
    const quantity = Number(row.querySelector(".line-quantity").value);
    const price = Number(row.querySelector(".line-price").value);

    if (
      !itemId ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      toast("تحقق من الصنف والكمية وسعر الوحدة.");
      return;
    }

    const catalogItem = db.items.find(item => item.id === itemId);

    if (!catalogItem) {
      toast("أحد الأصناف غير موجود في القائمة.");
      return;
    }

    invoiceItems.push({
      itemId,
      name: catalogItem.name,
      unit: catalogItem.unit || "حبة",
      quantity,
      price,
      total: quantity * price
    });
  }

  if (!invoiceItems.length) {
    toast("أضف صنفًا واحدًا على الأقل.");
    return;
  }

  const total = invoiceItems.reduce(
    (sum, item) => sum + item.total,
    0
  );

  const invoice = {
    id: makeId("invoice"),
    number: createInvoiceNumber(date),
    date,
    driverId,
    driverName: driver.name,
    notes,
    items: invoiceItems,
    total,
    createdAt: new Date().toISOString(),
    archived: false
  };

  db.invoices.push(invoice);

  if (!saveDB()) {
    db.invoices = db.invoices.filter(item => item.id !== invoice.id);
    return;
  }

  $("invoiceNotes").value = "";
  $("invoiceItems").innerHTML = "";
  addInvoiceItemRow();

  toast("تم حفظ الفاتورة بنجاح.");

  refreshAll();
  showPage("dashboard");
});

function createInvoiceNumber(date) {
  const count = db.invoices.concat(db.archives).length + 1;

  return "D-" + date.replaceAll("-", "") + "-" +
    String(count).padStart(4, "0");
}


/* ==========================================
   لوحة التحكم
========================================== */

function getInvoicesForDate(date) {
  return db.invoices.filter(invoice => invoice.date === date);
}

function invoiceTotal(invoice) {
  if (Number.isFinite(Number(invoice.total))) {
    return Number(invoice.total);
  }

  return (invoice.items || []).reduce(
    (sum, item) => sum + number(item.quantity) * number(item.price),
    0
  );
}

function renderDashboard() {
  const todayInvoices = getInvoicesForDate(todayISO());

  const itemCount = todayInvoices.reduce((sum, invoice) => {
    return sum + (invoice.items || []).reduce(
      (subSum, item) => subSum + number(item.quantity),
      0
    );
  }, 0);

  const total = todayInvoices.reduce(
    (sum, invoice) => sum + invoiceTotal(invoice),
    0
  );

  $("statInvoices").textContent = todayInvoices.length;
  $("statDrivers").textContent = db.drivers.length;
  $("statItems").textContent = itemCount;
  $("statTotal").textContent = money(total);

  const recent = [...todayInvoices]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  $("recentInvoices").innerHTML = recent.length
    ? recent.map(invoice => invoiceCardHTML(invoice)).join("")
    : `
      <div class="empty-state">
        <span>🧾</span>
        <p>لا توجد فواتير مسجلة اليوم.</p>
      </div>
    `;
}

function invoiceCardHTML(invoice) {
  return `
    <article class="invoice-card">
      <div class="invoice-card-header">
        <div>
          <h4>${escapeHTML(invoice.driverName)}</h4>
          <p>رقم الفاتورة: ${escapeHTML(invoice.number || "—")}</p>
          <p>التاريخ: ${escapeHTML(invoice.date)}</p>
          <p>عدد الأصناف: ${(invoice.items || []).length}</p>
        </div>
      </div>

      <div class="invoice-card-total">
        ${money(invoiceTotal(invoice))}
      </div>

      <div class="invoice-card-actions">
        <button
          type="button"
          class="edit-button"
          data-view-invoice="${escapeHTML(invoice.id)}">
          عرض التفاصيل
        </button>
      </div>
    </article>
  `;
}


/* ==========================================
   عرض تفاصيل الفاتورة
========================================== */

function openModal(title, content) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = content;
  $("modal").classList.remove("hidden");
}

function closeModal() {
  $("modal").classList.add("hidden");
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-view-invoice]");

  if (!button) return;

  const id = button.dataset.viewInvoice;

  const invoice = db.invoices.concat(db.archives)
    .find(entry => entry.id === id);

  if (!invoice) {
    toast("لم يتم العثور على الفاتورة.");
    return;
  }

  const items = (invoice.items || []).map(item => `
    <tr>
      <td>${escapeHTML(item.name)}</td>
      <td>${number(item.quantity)}</td>
      <td>${money(item.price)}</td>
      <td>${money(item.total ?? number(item.quantity) * number(item.price))}</td>
    </tr>
  `).join("");

  openModal("تفاصيل الفاتورة", `
    <p><strong>رقم الفاتورة:</strong> ${escapeHTML(invoice.number || "—")}</p>
    <p><strong>السائق:</strong> ${escapeHTML(invoice.driverName)}</p>
    <p><strong>التاريخ:</strong> ${escapeHTML(invoice.date)}</p>

    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>الصنف</th>
            <th>الكمية</th>
            <th>سعر الوحدة</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>${items}</tbody>
      </table>
    </div>

    <div class="invoice-total-card">
      <span>الإجمالي</span>
      <strong>${money(invoiceTotal(invoice))}</strong>
    </div>

    <p><strong>ملاحظات:</strong> ${escapeHTML(invoice.notes || "لا توجد")}</p>
  `);
});


/* ==========================================
   التقارير اليومية
========================================== */

function groupInvoicesByDriver(invoices) {
  const groups = new Map();

  invoices.forEach(invoice => {
    const key = invoice.driverId || invoice.driverName || "unknown";

    if (!groups.has(key)) {
      groups.set(key, {
        driverId: invoice.driverId,
        driverName: invoice.driverName || "سائق غير معروف",
        invoices: [],
        items: new Map(),
        total: 0
      });
    }

    const group = groups.get(key);

    group.invoices.push(invoice);
    group.total += invoiceTotal(invoice);

    (invoice.items || []).forEach(item => {
      const itemKey = item.itemId || item.name;

      if (!group.items.has(itemKey)) {
        group.items.set(itemKey, {
          name: item.name,
          unit: item.unit || "حبة",
          quantity: 0,
          total: 0
        });
      }

      const summary = group.items.get(itemKey);

      summary.quantity += number(item.quantity);
      summary.total += number(
        item.total ?? number(item.quantity) * number(item.price)
      );
    });
  });

  return [...groups.values()].map(group => ({
    ...group,
    items: [...group.items.values()]
  }));
}

function generateReport() {
  const date = $("reportDate").value || todayISO();
  const selectedDriver = $("reportDriver").value || "all";

  let invoices = db.invoices.concat(db.archives).filter(
    invoice => invoice.date === date
  );

  if (selectedDriver !== "all") {
    invoices = invoices.filter(
      invoice => invoice.driverId === selectedDriver
    );
  }

  const groups = groupInvoicesByDriver(invoices);

  lastReportGroups = groups;

  const totalInvoices = invoices.length;
  const totalValue = invoices.reduce(
    (sum, invoice) => sum + invoiceTotal(invoice),
    0
  );

  const totalQuantities = invoices.reduce((sum, invoice) => {
    return sum + (invoice.items || []).reduce(
      (subSum, item) => subSum + number(item.quantity),
      0
    );
  }, 0);

  $("reportSummary").innerHTML = `
    <div class="summary-box">
      <div class="summary-item">
        <span>عدد الفواتير</span>
        <strong>${totalInvoices}</strong>
      </div>

      <div class="summary-item">
        <span>عدد السائقين</span>
        <strong>${groups.length}</strong>
      </div>

      <div class="summary-item">
        <span>إجمالي الكميات</span>
        <strong>${totalQuantities}</strong>
      </div>

      <div class="summary-item">
        <span>إجمالي المبالغ</span>
        <strong>${money(totalValue)}</strong>
      </div>
    </div>
  `;

  if (!groups.length) {
    $("reportResults").innerHTML = `
      <div class="empty-state">
        <span>📊</span>
        <p>لا توجد فواتير في التاريخ المحدد.</p>
      </div>
    `;
    return;
  }

  $("reportResults").innerHTML = groups.map((group, index) => `
    <article class="report-driver-card">

      <div class="report-driver-header">
        <h3>${escapeHTML(group.driverName)}</h3>
        <p>
          عدد الفواتير: ${group.invoices.length}
          — التاريخ: ${escapeHTML(date)}
        </p>
      </div>

      <div class="report-table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>الصنف</th>
              <th>الكمية</th>
              <th>الوحدة</th>
              <th>الإجمالي</th>
            </tr>
          </thead>

          <tbody>
            ${group.items.map(item => `
              <tr>
                <td>${escapeHTML(item.name)}</td>
                <td>${item.quantity}</td>
                <td>${escapeHTML(item.unit)}</td>
                <td>${money(item.total)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="report-driver-total">
        <span>إجمالي حساب السائق</span>
        <strong>${money(group.total)}</strong>
      </div>

      <div class="report-driver-actions">
        <button
          type="button"
          class="whatsapp-button"
          data-whatsapp-driver="${index}">
          🟢 واتساب
        </button>
      </div>

    </article>
  `).join("");
}

$("generateReport").addEventListener("click", generateReport);


/* ==========================================
   تجهيز رسالة واتساب
========================================== */

function buildDriverReportMessage(group, date) {
  const lines = [
    "مطاعم ومطابخ سحايب ديرتي",
    "📋 تقرير صرف الأصناف",
    "━━━━━━━━━━━━━━",
    "👤 السائق: " + group.driverName,
    "📅 التاريخ: " + date,
    "🧾 عدد الفواتير: " + group.invoices.length,
    "",
    "تفاصيل الأصناف:"
  ];

  group.items.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.name}`,
      `   الكمية: ${item.quantity} ${item.unit}`,
      `   إجمالي الصنف: ${money(item.total)}`,
      ""
    );
  });

  lines.push(
    "━━━━━━━━━━━━━━",
    "💰 إجمالي حساب السائق: " + money(group.total),
    "",
    "تم إعداد التقرير بواسطة نظام حسابات ديرتي."
  );

  return lines.join("\n");
}

function openWhatsApp(message, phone = WHATSAPP_NUMBER) {
  const url = "https://wa.me/" +
    phone.replace(/\D/g, "") +
    "?text=" +
    encodeURIComponent(message);

  window.open(url, "_blank", "noopener,noreferrer");
}

$("reportResults").addEventListener("click", event => {
  const button = event.target.closest("[data-whatsapp-driver]");

  if (!button) return;

  const index = Number(button.dataset.whatsappDriver);
  const group = lastReportGroups[index];

  if (!group) {
    toast("أنشئ التقرير أولًا.");
    return;
  }

  const date = $("reportDate").value || todayISO();

  openWhatsApp(buildDriverReportMessage(group, date));
});

$("shareReports").addEventListener("click", () => {
  generateReport();

  if (!lastReportGroups.length) {
    toast("لا توجد تقارير لإرسالها.");
    return;
  }

  const date = $("reportDate").value || todayISO();

  const message = lastReportGroups.map(group =>
    buildDriverReportMessage(group, date)
  ).join("\n\n\n");

  openWhatsApp(message);
});


/* ==========================================
   الأرشيف
========================================== */

function renderArchive() {
  const date = $("archiveDate").value;
  const driverId = $("archiveDriver").value || "all";

  let invoices = [...db.archives];

  if (date) {
    invoices = invoices.filter(invoice => invoice.date === date);
  }

  if (driverId !== "all") {
    invoices = invoices.filter(invoice => invoice.driverId === driverId);
  }

  invoices.sort((a, b) =>
    (b.createdAt || "").localeCompare(a.createdAt || "")
  );

  const total = invoices.reduce(
    (sum, invoice) => sum + invoiceTotal(invoice),
    0
  );

  $("archiveSummary").innerHTML = `
    <div class="summary-box">
      <div class="summary-item">
        <span>عدد الفواتير</span>
        <strong>${invoices.length}</strong>
      </div>

      <div class="summary-item">
        <span>إجمالي المبالغ</span>
        <strong>${money(total)}</strong>
      </div>
    </div>
  `;

  $("archiveList").innerHTML = invoices.length
    ? invoices.map(invoiceCardHTML).join("")
    : `
      <div class="empty-state">
        <span>🗂️</span>
        <p>لا توجد فواتير مطابقة للبحث في الأرشيف.</p>
      </div>
    `;
}

$("searchArchive").addEventListener("click", renderArchive);

$("showAllArchive").addEventListener("click", () => {
  $("archiveDate").value = "";
  $("archiveDriver").value = "all";

  renderArchive();
});


/* ==========================================
   إنهاء الدوام
========================================== */

$("finishDay").addEventListener("click", () => {
  const date = todayISO();

  const todaysInvoices = db.invoices.filter(
    invoice => invoice.date === date
  );

  if (!todaysInvoices.length) {
    toast("لا توجد فواتير مؤرخة بتاريخ اليوم لإنهاء دوامها.");
    return;
  }

  const groups = groupInvoicesByDriver(todaysInvoices);

  const total = todaysInvoices.reduce(
    (sum, invoice) => sum + invoiceTotal(invoice),
    0
  );

  const confirmed = confirmAction(
    "إنهاء دوام يوم " + date + "؟\n\n" +
    "عدد الفواتير: " + todaysInvoices.length + "\n" +
    "عدد السائقين: " + groups.length + "\n" +
    "إجمالي الصرف: " + money(total) + "\n\n" +
    "ستُنقل الفواتير إلى الأرشيف وتبقى محفوظة.\n" +
    "سيُجهّز تقرير واتساب، ولن تُحذف الفواتير القديمة.\n\n" +
    "هل تريد المتابعة؟"
  );

  if (!confirmed) return;

  const previousInvoices = [...db.invoices];
  const previousArchives = [...db.archives];
  const previousClosures = [...db.dayClosures];

  const closure = {
    id: makeId("closure"),
    date,
    invoiceCount: todaysInvoices.length,
    driverCount: groups.length,
    total,
    createdAt: new Date().toISOString(),
    reports: groups.map(group => ({
      driverId: group.driverId,
      driverName: group.driverName,
      total: group.total,
      message: buildDriverReportMessage(group, date)
    }))
  };

  db.archives.push(
    ...todaysInvoices.map(invoice => ({
      ...invoice,
      archived: true,
      archivedAt: new Date().toISOString()
    }))
  );

  db.invoices = db.invoices.filter(
    invoice => invoice.date !== date
  );

  db.dayClosures.push(closure);

  if (!saveDB()) {
    db.invoices = previousInvoices;
    db.archives = previousArchives;
    db.dayClosures = previousClosures;
    return;
  }

  refreshAll();

  const combinedMessage = groups.map(group =>
    buildDriverReportMessage(group, date)
  ).join("\n\n\n");

  const sendNow = confirmAction(
    "تم إنهاء الدوام وحفظ الفواتير في الأرشيف.\n\n" +
    "هل تريد فتح واتساب وتجهيز التقارير الآن؟"
  );

  if (sendNow) {
    openWhatsApp(combinedMessage);
  }

  toast("تم إنهاء الدوام وحفظ الفواتير القديمة.");
  showPage("dashboard");
});


/* ==========================================
   النسخ الاحتياطي والاستعادة
========================================== */

$("exportBackup").addEventListener("click", () => {
  const backup = {
    application: "Deerty Driver Accounts",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: db
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "deerty-backup-" + todayISO() + ".json";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);

  toast("تم تجهيز ملف النسخة الاحتياطية.");
});

$("importBackup").addEventListener("click", async () => {
  const file = $("importBackupFile").files[0];

  if (!file) {
    toast("اختر ملف النسخة الاحتياطية أولًا.");
    return;
  }

  if (!confirmAction(
    "استعادة النسخة الاحتياطية ستستبدل البيانات الحالية.\n" +
    "صدّر نسخة من البيانات الحالية قبل المتابعة.\n\n" +
    "هل تريد الاستعادة؟"
  )) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    const restored = parsed.data || parsed;

    if (
      !restored ||
      !Array.isArray(restored.drivers) ||
      !Array.isArray(restored.items) ||
      !Array.isArray(restored.invoices) ||
      !Array.isArray(restored.archives)
    ) {
      throw new Error("Invalid backup format");
    }

    const previousDB = db;

    db = {
      ...createInitialDB(),
      ...restored,
      drivers: restored.drivers,
      items: restored.items,
      invoices: restored.invoices,
      archives: restored.archives,
      dayClosures: Array.isArray(restored.dayClosures)
        ? restored.dayClosures
        : []
    };

    if (!saveDB()) {
      db = previousDB;
      return;
    }

    $("importBackupFile").value = "";

    refreshAll();
    toast("تمت استعادة النسخة الاحتياطية بنجاح.");

  } catch (error) {
    console.error(error);
    toast("تعذر استعادة الملف. تأكد أنه نسخة احتياطية صحيحة.");
  }
});


/* ==========================================
   تحديث بيانات التطبيق
========================================== */

function refreshAll() {
  populateSelects();
  renderDashboard();
  renderDrivers();
  renderItems();
  generateReport();
  renderArchive();
}

function initializeApp() {
  setTodayDate();
  populateSelects();

  $("archiveDate").value = "";

  if (!$("invoiceItems").children.length) {
    addInvoiceItemRow();
  }

  refreshAll();
  showPage("dashboard");
}

initializeApp();

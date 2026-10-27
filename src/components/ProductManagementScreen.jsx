import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Download,
  ImagePlus,
  PackagePlus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useProductManagement } from "../hooks/useProductManagement";
import { hasPosCapability, POS_CAPABILITIES } from "../shared/permissions";
import { validateProductImage } from "../services/product-image.service";
import ProductImage from "./products/ProductImage";
import VirtualizedProductGrid from "./products/VirtualizedProductGrid";
import SearchFilterBar, { FilterSelect } from "./ui/SearchFilterBar";
import AccessibleDialog from "./admin/AccessibleDialog";
import StatusBadge from "./ui/StatusBadge";
import { downloadCsv } from "../utils/downloadCsv";

const emptyForm = {
  categoryId: "",
  name: "",
  description: "",
  unit: "",
  price: "",
  cost: "",
  isActive: true,
  isAvailable: true,
};

export default function ProductManagementScreen({
  role,
  onBack,
  embedded = false,
  permissions = null,
  initialProductId = "",
}) {
  const manager = useProductManagement(
    !permissions || permissions.includes("category.view"),
  );
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [fileError, setFileError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [viewOnly, setViewOnly] = useState(false);
  const originalForm = useRef(emptyForm);
  const submitting = useRef(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const deferredQuery = useDeferredValue(query);
  const deepLinkOpened = useRef(false);
  const canDelete = hasPosCapability(
    role,
    POS_CAPABILITIES.DELETE_PRODUCT_IMAGE,
  );
  const canCreate = !permissions || permissions.includes("product.create");
  const canEdit = !permissions || permissions.includes("product.edit");
  const canManageImage =
    !permissions || permissions.includes("product.manage_image");
  const canDeactivate =
    !permissions || permissions.includes("product.deactivate");
  const visibleProducts = useMemo(
    () =>
      manager.products.filter(
        (product) =>
          (!categoryFilter || product.categoryId === categoryFilter) &&
          (!statusFilter || (statusFilter === "ACTIVE") === product.isActive) &&
          (!availabilityFilter ||
            (availabilityFilter === "AVAILABLE") === product.isAvailable) &&
          `${product.code} ${product.name}`
            .toLowerCase()
            .includes(deferredQuery.trim().toLowerCase()),
      ),
    [
      manager.products,
      categoryFilter,
      statusFilter,
      availabilityFilter,
      deferredQuery,
    ],
  );

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const dirty = Boolean(
    editing &&
    (file || JSON.stringify(form) !== JSON.stringify(originalForm.current)),
  );
  const close = () => {
    if (
      manager.isSaving ||
      (dirty && !window.confirm("Discard unsaved product changes?"))
    )
      return;
    finishClose();
  };
  const finishClose = () => {
    setEditing(null);
    setForm(emptyForm);
    setFile(null);
    setPreview("");
    setFileError("");
  };
  useEffect(() => {
    setPage(1);
  }, [deferredQuery, categoryFilter, statusFilter, availabilityFilter]);
  useEffect(() => {
    const guard = (event) => {
      if (
        manager.isSaving ||
        (dirty && !window.confirm("Discard unsaved product changes?"))
      )
        event.preventDefault();
    };
    const unload = (event) => {
      if (dirty || manager.isSaving) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("before-admin-navigate", guard);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("before-admin-navigate", guard);
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty, manager.isSaving]);
  const open = (product = {}, readOnly = false) => {
    setViewOnly(readOnly);
    setEditing(product.id ? product : { isNew: true });
    setForm(
      product.id
        ? {
            categoryId: product.categoryId,
            name: product.name,
            description: product.description,
            unit: product.unit,
            price: String(product.price),
            cost: String(product.cost),
            isActive: product.isActive,
            isAvailable: product.isAvailable,
          }
        : emptyForm,
    );
    originalForm.current = product.id
      ? {
          categoryId: product.categoryId,
          name: product.name,
          description: product.description,
          unit: product.unit,
          price: String(product.price),
          cost: String(product.cost),
          isActive: product.isActive,
          isAvailable: product.isAvailable,
        }
      : emptyForm;
    setFile(null);
    setPreview("");
    setFileError("");
  };
  useEffect(() => {
    if (!initialProductId || deepLinkOpened.current || manager.isLoading)
      return;
    const product = manager.products.find(
      (item) => item.id === initialProductId,
    );
    if (product) {
      deepLinkOpened.current = true;
      open(product);
    }
  }, [initialProductId, manager.isLoading, manager.products]);
  const chooseFile = (event) => {
    const next = event.target.files?.[0] || null;
    if (preview) URL.revokeObjectURL(preview);
    try {
      if (next) validateProductImage(next);
      setFile(next);
      setPreview(next ? URL.createObjectURL(next) : "");
      setFileError("");
    } catch (error) {
      setFile(null);
      setPreview("");
      setFileError(error.message);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current || viewOnly) return;
    submitting.current = true;
    try {
      const ok = await manager.save(
        { ...form, price: Number(form.price), cost: Number(form.cost) },
        file,
        editing?.id ? editing : null,
        Boolean(editing?.id && !canEdit),
        (saved) => {
          setEditing(saved);
          originalForm.current = { ...form };
        },
      );
      if (ok) finishClose();
    } finally {
      submitting.current = false;
    }
  };

  return (
    <div
      className={`${embedded ? "" : "h-full overflow-y-auto bg-[#F8F9FA] p-6"} text-[#121212]`}
    >
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!embedded && (
            <button onClick={onBack} className="rounded-xl bg-white p-3 shadow">
              <ArrowLeft />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-black">Product Management</h1>
            <p className="text-sm text-gray-500">
              Manage menu items, prices, images, and availability.
            </p>
          </div>
        </div>
        <div className="admin-page-actions">
          {embedded && (
            <button
              type="button"
              className="admin-button admin-button-secondary"
              disabled={manager.isLoading || !visibleProducts.length}
              onClick={() =>
                downloadCsv(
                  "menu-items.csv",
                  [
                    "SKU",
                    "Product",
                    "Category",
                    "Price",
                    "Cost",
                    "Status",
                    "Availability",
                  ],
                  visibleProducts.map((product) => [
                    product.code,
                    product.name,
                    manager.categories.find(
                      (category) => category.id === product.categoryId,
                    )?.name || "",
                    product.price.toFixed(2),
                    product.cost.toFixed(2),
                    product.isActive ? "Active" : "Inactive",
                    product.isAvailable ? "Available" : "Sold out",
                  ]),
                )
              }
            >
              <Download size={15} />
              Export
            </button>
          )}
          {canCreate && (
            <button
              onClick={() => open()}
              className="flex items-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-3 font-black"
            >
              <PackagePlus size={18} /> Add Product
            </button>
          )}
        </div>
      </header>
      {manager.error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {manager.error}
        </div>
      )}
      {manager.notice && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {manager.notice}
        </div>
      )}
      <SearchFilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="Search product name or code"
        resultCount={visibleProducts.length}
        onReset={() => {
          setQuery("");
          setCategoryFilter("");
          setStatusFilter("");
          setAvailabilityFilter("");
        }}
        className="mb-5"
      >
        <FilterSelect
          label="Category"
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={[
            { value: "", label: "All" },
            ...manager.categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "", label: "All" },
            { value: "ACTIVE", label: "Active" },
            { value: "INACTIVE", label: "Inactive" },
          ]}
        />
        <FilterSelect
          label="Stock"
          value={availabilityFilter}
          onChange={setAvailabilityFilter}
          options={[
            { value: "", label: "All" },
            { value: "AVAILABLE", label: "Available" },
            { value: "SOLD_OUT", label: "Sold out" },
          ]}
        />
      </SearchFilterBar>
      {embedded ? (
        <section className="admin-surface admin-menu-table">
          {manager.isLoading ? (
            <p role="status" className="p-6">
              Loading menu items…
            </p>
          ) : (
            <div className="admin-table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "Product",
                      "Category",
                      "Price",
                      "Status",
                      "Availability",
                      "Actions",
                    ].map((label) => (
                      <th
                        key={label}
                        className={label === "Actions" ? "text-right" : ""}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.length ? (
                    visibleProducts
                      .slice(
                        (Math.min(
                          page,
                          Math.max(1, Math.ceil(visibleProducts.length / 25)),
                        ) -
                          1) *
                          25,
                        Math.min(
                          page,
                          Math.max(1, Math.ceil(visibleProducts.length / 25)),
                        ) * 25,
                      )
                      .map((product) => (
                        <tr key={product.id}>
                          <td>
                            <div className="admin-product-cell">
                              <ProductImage
                                src={product.imageUrl}
                                alt=""
                                className="admin-product-thumbnail"
                              />
                              <span>
                                <button
                                  type="button"
                                  className="admin-text-link admin-item-link"
                                  onClick={() => open(product, true)}
                                >
                                  {product.name}
                                </button>
                                <small>{product.code}</small>
                              </span>
                            </div>
                          </td>
                          <td>
                            {manager.categories.find(
                              (category) => category.id === product.categoryId,
                            )?.name || "—"}
                          </td>
                          <td className="admin-money">
                            RM {product.price.toFixed(2)}
                          </td>
                          <td>
                            <StatusBadge
                              value={product.isActive ? "ACTIVE" : "INACTIVE"}
                            />
                          </td>
                          <td>
                            <StatusBadge
                              value={
                                product.isAvailable ? "AVAILABLE" : "SOLD_OUT"
                              }
                            />
                          </td>
                          <td>
                            <div className="admin-table-actions">
                              <button
                                type="button"
                                className="admin-button admin-button-secondary"
                                onClick={() => open(product, true)}
                              >
                                View
                              </button>
                              {(canEdit || canManageImage) && (
                                <button
                                  type="button"
                                  className="admin-button admin-button-secondary"
                                  onClick={() => open(product)}
                                >
                                  Edit
                                </button>
                              )}
                              {canDelete &&
                                canManageImage &&
                                product.imagePath && (
                                  <button
                                    type="button"
                                    className="admin-icon-button text-red-600"
                                    disabled={manager.isSaving}
                                    aria-label={`Delete image for ${product.name}`}
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          `Delete the image for ${product.name}?`,
                                        )
                                      )
                                        void manager.removeImage(product);
                                    }}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-8 text-center">
                        No menu items match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <footer className="admin-table-footer">
            <span>{visibleProducts.length} menu items</span>
            <div className="admin-page-actions">
              <button
                type="button"
                className="admin-button admin-button-secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span>
                Page{" "}
                {Math.min(
                  page,
                  Math.max(1, Math.ceil(visibleProducts.length / 25)),
                )}{" "}
                of {Math.max(1, Math.ceil(visibleProducts.length / 25))}
              </span>
              <button
                type="button"
                className="admin-button admin-button-secondary"
                disabled={page * 25 >= visibleProducts.length}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          </footer>
        </section>
      ) : manager.isLoading ? (
        <p>Loading products…</p>
      ) : visibleProducts.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-gray-400">
          No products found.
        </p>
      ) : (
        <VirtualizedProductGrid
          items={visibleProducts}
          renderItem={(product) => (
            <article
              key={product.id}
              className="overflow-hidden rounded-2xl bg-white shadow"
            >
              <div className="h-44 bg-gray-100">
                <ProductImage
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <h2 className="font-black">{product.name}</h2>
                    <p className="text-xs text-gray-400">{product.code}</p>
                  </div>
                  <div className="text-right">
                    <strong>RM {product.price.toFixed(2)}</strong>
                    <p className="text-[10px] text-gray-400">
                      Cost RM {product.cost.toFixed(2)}
                    </p>
                  </div>
                </div>
                <p
                  className={`mt-2 text-xs font-bold ${product.isAvailable ? "text-emerald-600" : "text-red-600"}`}
                >
                  {product.isAvailable ? "Available" : "Sold Out"}
                </p>
                <p className="mt-1 text-[10px] text-gray-400">
                  {product.isActive ? "ACTIVE" : "INACTIVE"} · Updated{" "}
                  {product.updatedAt
                    ? new Date(product.updatedAt).toLocaleDateString()
                    : "-"}
                </p>
                <div className="mt-4 flex gap-2">
                  {(canEdit || canManageImage) && (
                    <button
                      onClick={() => open(product)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#121212] p-2 text-sm font-bold text-white"
                    >
                      <Pencil size={15} /> Edit / Replace
                    </button>
                  )}
                  {canDelete && product.imagePath && (
                    <button
                      disabled={manager.isSaving}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete the image for ${product.name}?`,
                          )
                        )
                          void manager.removeImage(product);
                      }}
                      aria-label="Delete product image"
                      className="rounded-xl border border-red-200 p-2 text-red-600"
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          )}
        />
      )}

      {editing && (
        <AccessibleDialog
          title={
            viewOnly
              ? "Product details"
              : editing.id
                ? "Edit Product"
                : "Add Product"
          }
          onClose={close}
          className={embedded ? "admin-record-drawer" : "max-w-xl"}
        >
          <form onSubmit={submit}>
            <div className="mb-5 flex justify-between">
              <h2 className="text-xl font-black">
                {viewOnly
                  ? "Product details"
                  : editing.id
                    ? "Edit Product"
                    : "Add Product"}
              </h2>
              <button
                type="button"
                aria-label="Close product details"
                onClick={close}
              >
                <X />
              </button>
            </div>
            {manager.error && (
              <p role="alert" className="admin-error">
                {manager.error}
              </p>
            )}
            <fieldset disabled={viewOnly || manager.isSaving}>
              {editing.id && (
                <label className="mb-4 block text-sm font-bold">
                  SKU
                  <input
                    value={editing.code}
                    readOnly
                    className="mt-1 w-full rounded-xl border p-3 font-normal"
                  />
                </label>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-bold">
                  Name
                  <input
                    disabled={Boolean(editing.id && !canEdit)}
                    required
                    maxLength={150}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1 w-full rounded-xl border p-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Category
                  <select
                    disabled={Boolean(editing.id && !canEdit)}
                    required
                    value={form.categoryId}
                    onChange={(e) =>
                      setForm({ ...form, categoryId: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border p-3 font-normal"
                  >
                    <option value="">Select category</option>
                    {form.categoryId &&
                      !manager.categories.some(
                        (category) => category.id === form.categoryId,
                      ) && (
                        <option value={form.categoryId}>
                          Current category
                        </option>
                      )}
                    {manager.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-bold">
                  Price (RM)
                  <input
                    disabled={Boolean(editing.id && !canEdit)}
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    value={form.price}
                    onChange={(e) =>
                      setForm({ ...form, price: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border p-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Cost (RM)
                  <input
                    disabled={Boolean(editing.id && !canEdit)}
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    value={form.cost}
                    onChange={(e) => setForm({ ...form, cost: e.target.value })}
                    className="mt-1 w-full rounded-xl border p-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Unit
                  <input
                    disabled={Boolean(editing.id && !canEdit)}
                    maxLength={20}
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="mt-1 w-full rounded-xl border p-3 font-normal"
                  />
                </label>
              </div>
              <label className="mt-4 block text-sm font-bold">
                Description
                <textarea
                  disabled={Boolean(editing.id && !canEdit)}
                  maxLength={1000}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border p-3 font-normal"
                />
              </label>
              {canManageImage && (
                <div className="mt-4 rounded-xl border border-dashed p-4">
                  <label className="flex cursor-pointer items-center gap-2 font-bold">
                    <ImagePlus /> Select JPG, PNG or WEBP (max 5 MB)
                    <input
                      className="sr-only"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      onChange={chooseFile}
                    />
                  </label>
                  {fileError && (
                    <p className="mt-2 text-sm text-red-600">{fileError}</p>
                  )}
                  {(preview || editing.imageUrl) && (
                    <ProductImage
                      src={preview || editing.imageUrl}
                      alt="Image preview"
                      className="mt-3 h-40 w-full rounded-xl object-cover"
                    />
                  )}
                </div>
              )}
              <div className="mt-4 flex gap-6 text-sm">
                <label>
                  <input
                    disabled={!canDeactivate}
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm({ ...form, isActive: e.target.checked })
                    }
                  />{" "}
                  Active
                </label>
                <label>
                  <input
                    disabled={!canEdit}
                    type="checkbox"
                    checked={form.isAvailable}
                    onChange={(e) =>
                      setForm({ ...form, isAvailable: e.target.checked })
                    }
                  />{" "}
                  Available
                </label>
              </div>
            </fieldset>
            {viewOnly ? (
              (canEdit || canManageImage) && (
                <button
                  type="button"
                  className="admin-button admin-button-primary mt-6"
                  onClick={() => setViewOnly(false)}
                >
                  Edit product
                </button>
              )
            ) : (
              <button
                disabled={
                  manager.isSaving ||
                  Boolean(fileError) ||
                  Boolean(editing.id && !canEdit && !file)
                }
                className="mt-6 w-full rounded-xl bg-[#D4AF37] p-4 font-black disabled:opacity-50"
              >
                {manager.isSaving ? "Saving…" : "Save Product"}
              </button>
            )}
          </form>
        </AccessibleDialog>
      )}
    </div>
  );
}

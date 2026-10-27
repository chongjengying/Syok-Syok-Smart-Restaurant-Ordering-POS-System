import { useEffect, useRef, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { usePreviewWorkspace } from "../hooks/usePreviewWorkspace";
import { parseMoney } from "../previewMoney";
import { Button, Field, Modal, Tag, TextInput } from "./PreviewUi";

export default function ProductEditor({ row, onClose, onSaved }) {
  const workspace = usePreviewWorkspace();
  const [section, setSection] = useState("Details");
  const [draft, setDraft] = useState(() => ({
    Product: row?.Product || "",
    SKU: row?.SKU || "",
    Description: row?.Description || "",
    Category: row?.Category || workspace.modules.categories[0]?.Category || "",
    Price: String((parseMoney(row?.Price || "0") || 0) / 100),
    Status: row?.Status || "Available",
    "Stock tracking": row?.["Stock tracking"] || "On",
    _allBranches: row?._allBranches !== false,
    _branches: row?._branches || [],
    _photo: row?._photo || "",
    _modifiers: structuredClone(row?._modifiers || []),
  }));
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const uploadRef = useRef(null);
  const setDirtyContext = workspace.setDirty;
  useEffect(() => {
    setDirtyContext(dirty);
    return () => setDirtyContext(false);
  }, [dirty, setDirtyContext]);
  const update = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setDiscard(false);
  };
  const updateGroup = (id, values) =>
    update(
      "_modifiers",
      draft._modifiers.map((group) =>
        group.id === id ? { ...group, ...values } : group,
      ),
    );
  const upload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError("Use a PNG, JPEG, or WebP file smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("_photo", String(reader.result));
    reader.readAsDataURL(file);
  };
  const save = (event) => {
    event.preventDefault();
    setError("");
    if (
      !draft.Product.trim() ||
      !draft.SKU.trim() ||
      !draft.Category ||
      !Number.isSafeInteger(parseMoney(draft.Price)) ||
      parseMoney(draft.Price) <= 0
    ) {
      setError(
        "Enter an item name, unique SKU, category, and selling price greater than zero.",
      );
      return;
    }
    if (!draft._allBranches && !draft._branches.length) {
      setError("Choose at least one branch or enable all branches.");
      setSection("Pricing & availability");
      return;
    }
    for (const group of draft._modifiers) {
      if (
        !group.name.trim() ||
        !group.options.length ||
        group.options.some(
          (option) =>
            !option.name.trim() ||
            !Number.isSafeInteger(option.priceCents) ||
            option.priceCents < 0,
        ) ||
        group.max < 1 ||
        group.max > group.options.length
      ) {
        setError(
          "Give each modifier group a name, valid options, and a selection limit within its option count.",
        );
        setSection("Modifiers & add-ons");
        return;
      }
    }
    const result = workspace.saveRecord(
      "products",
      {
        ...row,
        ...draft,
        Product: draft.Product.trim(),
        SKU: draft.SKU.trim().toUpperCase(),
      },
      row?._id,
    );
    if (result.error) {
      setError(result.error);
      return;
    }
    setDirtyContext(false);
    onSaved(
      row
        ? "Menu item updated in the sample workspace."
        : "Menu item created in the sample workspace.",
    );
  };
  const requestClose = () => (dirty ? setDiscard(true) : onClose());
  return (
    <Modal
      title={row ? "Edit menu item" : "Add menu item"}
      description="Details, pricing, and options in one consistent form."
      wide
      onClose={requestClose}
      footer={
        discard ? (
          <>
            <span className="preview-inline-error">
              Discard unsaved changes?
            </span>
            <Button variant="secondary" onClick={() => setDiscard(false)}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={onClose}>
              Discard changes
            </Button>
          </>
        ) : (
          <>
            {dirty && <Tag tone="amber">Unsaved changes</Tag>}
            <Button variant="secondary" onClick={requestClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="preview-product-form"
              disabled={!workspace.canEdit("products")}
            >
              {row ? "Save changes" : "Create record"}
            </Button>
          </>
        )
      }
    >
      <nav className="preview-tabs" aria-label="Menu item sections">
        {["Details", "Pricing & availability", "Modifiers & add-ons"].map(
          (label) => (
            <button
              type="button"
              key={label}
              className={section === label ? "is-active" : ""}
              onClick={() => setSection(label)}
            >
              {label}
            </button>
          ),
        )}
      </nav>
      <form id="preview-product-form" onSubmit={save} className="preview-form">
        {error && (
          <p className="preview-inline-error" role="alert">
            {error}
          </p>
        )}
        <fieldset
          disabled={!workspace.canEdit("products")}
          className="preview-form-fieldset"
        >
          {section === "Details" && (
            <>
              <div className="preview-product-image-editor">
                {draft._photo ? (
                  <img src={draft._photo} alt="Menu item preview" />
                ) : (
                  <span className="preview-product-photo-placeholder">
                    <ImagePlus size={26} />
                  </span>
                )}
                <div>
                  <strong>Item image</strong>
                  <small>PNG, JPEG, or WebP · up to 2 MB · preview only</small>
                  <input
                    ref={uploadRef}
                    type="file"
                    hidden
                    accept="image/png,image/jpeg,image/webp"
                    onChange={upload}
                  />
                  <div className="preview-row-actions">
                    <Button
                      variant="secondary"
                      onClick={() => uploadRef.current?.click()}
                    >
                      Choose image
                    </Button>
                    {draft._photo && (
                      <Button
                        variant="quiet"
                        onClick={() => update("_photo", "")}
                      >
                        Remove image
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="preview-two-columns">
                <Field label="Product *">
                  <TextInput
                    value={draft.Product}
                    onChange={(event) => update("Product", event.target.value)}
                  />
                </Field>
                <Field label="SKU *">
                  <TextInput
                    value={draft.SKU}
                    onChange={(event) => update("SKU", event.target.value)}
                  />
                </Field>
                <Field label="Category">
                  <select
                    value={draft.Category}
                    onChange={(event) => update("Category", event.target.value)}
                  >
                    {[
                      ...new Set([
                        draft.Category,
                        ...workspace.modules.categories
                          .filter(
                            (category) => category.Visibility === "Visible",
                          )
                          .map((category) => category.Category),
                      ]),
                    ]
                      .filter(Boolean)
                      .map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                  </select>
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={draft.Description}
                  placeholder="Ingredients, preparation, and helpful information for customers."
                  onChange={(event) =>
                    update("Description", event.target.value)
                  }
                />
              </Field>
            </>
          )}
          {section === "Pricing & availability" && (
            <>
              <div className="preview-two-columns">
                <Field
                  label="Price *"
                  hint="Selling price in RM, before configured tax and service charge."
                >
                  <TextInput
                    type="number"
                    min=".01"
                    step=".01"
                    value={draft.Price}
                    onChange={(event) => update("Price", event.target.value)}
                  />
                </Field>
                <Field label="Status">
                  <select
                    value={draft.Status}
                    onChange={(event) => update("Status", event.target.value)}
                  >
                    <option>Available</option>
                    <option>Unavailable</option>
                  </select>
                </Field>
                <Field label="Stock tracking">
                  <select
                    value={draft["Stock tracking"]}
                    onChange={(event) =>
                      update("Stock tracking", event.target.value)
                    }
                  >
                    <option>On</option>
                    <option>Off</option>
                  </select>
                </Field>
              </div>
              <div className="preview-form-section-label">
                Branch availability
              </div>
              <label className="preview-checkbox">
                <input
                  type="checkbox"
                  checked={draft._allBranches}
                  onChange={(event) =>
                    update("_allBranches", event.target.checked)
                  }
                />
                Available in all branches
              </label>
              {!draft._allBranches &&
                workspace.availableBranches.map((branch) => (
                  <label key={branch.id} className="preview-checkbox">
                    <input
                      type="checkbox"
                      checked={draft._branches.includes(branch.name)}
                      onChange={(event) =>
                        update(
                          "_branches",
                          event.target.checked
                            ? [...draft._branches, branch.name]
                            : draft._branches.filter(
                                (name) => name !== branch.name,
                              ),
                        )
                      }
                    />
                    {branch.name}
                  </label>
                ))}
              <p className="preview-context-note">
                Availability controls the sample order composer. Historical
                orders retain their item snapshots.
              </p>
            </>
          )}
          {section === "Modifiers & add-ons" && (
            <>
              <div className="preview-module-section-title">
                <div>
                  <h3>Customer choices</h3>
                  <p className="preview-context-note">
                    Use required groups for size or temperature; optional groups
                    for extras.
                  </p>
                </div>
                <Button
                  icon={Plus}
                  variant="secondary"
                  onClick={() =>
                    update("_modifiers", [
                      ...draft._modifiers,
                      {
                        id: crypto.randomUUID(),
                        name: "",
                        required: false,
                        max: 1,
                        options: [
                          { id: crypto.randomUUID(), name: "", priceCents: 0 },
                        ],
                      },
                    ])
                  }
                >
                  Add group
                </Button>
              </div>
              {!draft._modifiers.length && (
                <div className="preview-empty">
                  <strong>No modifiers yet</strong>
                  <span>
                    Items without options can be added directly to an order.
                  </span>
                </div>
              )}
              {draft._modifiers.map((group) => (
                <section
                  className="preview-modifier-group-editor"
                  key={group.id}
                >
                  <div className="preview-two-columns">
                    <Field label="Group name">
                      <TextInput
                        value={group.name}
                        placeholder="e.g. Size, Temperature, Extras"
                        onChange={(event) =>
                          updateGroup(group.id, { name: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Maximum selections">
                      <TextInput
                        type="number"
                        min="1"
                        max={group.options.length || 1}
                        value={group.max}
                        onChange={(event) =>
                          updateGroup(group.id, {
                            max: Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <label className="preview-checkbox">
                    <input
                      type="checkbox"
                      checked={group.required}
                      onChange={(event) =>
                        updateGroup(group.id, {
                          required: event.target.checked,
                        })
                      }
                    />
                    Require at least one option
                  </label>
                  {group.options.map((option, index) => (
                    <div
                      className="preview-modifier-option-editor"
                      key={option.id}
                    >
                      <Field label={`Option ${index + 1} name`}>
                        <TextInput
                          value={option.name}
                          onChange={(event) =>
                            updateGroup(group.id, {
                              options: group.options.map((item) =>
                                item.id === option.id
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label={`Option ${index + 1} extra (RM)`}>
                        <TextInput
                          type="number"
                          min="0"
                          step=".01"
                          value={
                            Number.isFinite(option.priceCents)
                              ? (option.priceCents / 100).toFixed(2)
                              : ""
                          }
                          onChange={(event) =>
                            updateGroup(group.id, {
                              options: group.options.map((item) =>
                                item.id === option.id
                                  ? {
                                      ...item,
                                      priceCents: parseMoney(
                                        event.target.value,
                                      ),
                                    }
                                  : item,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Button
                        variant="quiet"
                        aria-label={`Remove option ${index + 1}`}
                        onClick={() =>
                          updateGroup(group.id, {
                            options: group.options.filter(
                              (item) => item.id !== option.id,
                            ),
                            max: Math.min(
                              group.max,
                              Math.max(1, group.options.length - 1),
                            ),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  ))}
                  <div className="preview-row-actions">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        updateGroup(group.id, {
                          options: [
                            ...group.options,
                            {
                              id: crypto.randomUUID(),
                              name: "",
                              priceCents: 0,
                            },
                          ],
                        })
                      }
                    >
                      Add option
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() =>
                        update(
                          "_modifiers",
                          draft._modifiers.filter(
                            (item) => item.id !== group.id,
                          ),
                        )
                      }
                    >
                      Remove group
                    </Button>
                  </div>
                </section>
              ))}
            </>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}

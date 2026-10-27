import React, { useEffect, useRef, useState } from "react";
import { getProfile, updateProfile } from "../../features/auth/authService";
import { LANGUAGE_LABELS } from "../../utils/i18n";

export default function AdminAccountPage({
  profile,
  onUpdated,
  onLogout,
  lang = "en",
  setLang,
  enabledLanguages = ["en"],
}) {
  const [account, setAccount] = useState(profile);
  const [form, setForm] = useState(() => ({
    name: profile?.name || "",
    username: profile?.username || "",
    phone: profile?.phone || "",
  }));
  const [loading, setLoading] = useState(!profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const dirty =
    account &&
    ["name", "username", "phone"].some(
      (key) => form[key] !== (account[key] || ""),
    );
  useEffect(() => {
    let active = true;
    if (!profile)
      void getProfile().then((result) => {
        if (!active) return;
        setLoading(false);
        if (result.error) {
          setError(result.error.message);
          return;
        }
        setAccount(result.data);
        setForm({
          name: result.data.name || "",
          username: result.data.username || "",
          phone: result.data.phone || "",
        });
      });
    return () => {
      active = false;
    };
  }, [profile]);
  useEffect(() => {
    const guard = (event) => {
      if (
        dirty &&
        !window.confirm("You have unsaved profile changes. Discard changes?")
      )
        event.preventDefault();
    };
    const unload = (event) => {
      if (dirty) {
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
  }, [dirty]);
  const save = async (event) => {
    event.preventDefault();
    if (submitting.current || !dirty) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await updateProfile(form);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setAccount(result.data);
      setForm({
        name: result.data.name || "",
        username: result.data.username || "",
        phone: result.data.phone || "",
      });
      setMessage("Your profile has been updated.");
      onUpdated?.(result.data);
    } catch {
      setError("Unable to save your profile. Please try again.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };
  return (
    <section className="admin-account-page">
      <header className="admin-page-heading">
        <div>
          <h1>My profile</h1>
          <p>
            Manage your personal account. Restaurant settings apply to your
            business.
          </p>
        </div>
      </header>
      {loading ? (
        <p role="status">Loading your profile…</p>
      ) : (
        <form className="admin-surface admin-account-form" onSubmit={save}>
          {error && (
            <p role="alert" className="admin-error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="admin-success">
              {message}
            </p>
          )}
          <fieldset disabled={saving || !account} className="admin-form-grid">
            <label>
              Full name
              <input
                required
                maxLength={150}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Username
              <input
                required
                minLength={3}
                maxLength={50}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </label>
            <label>
              Email
              <input type="email" value={account?.email || ""} readOnly />
            </label>
            <label>
              Phone
              <input
                type="tel"
                maxLength={30}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
          </fieldset>
          <footer className="admin-form-actions">
            <span>{dirty ? "Unsaved changes" : "All changes saved"}</span>
            <button
              className="admin-button admin-button-primary"
              disabled={saving || !dirty}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </footer>
        </form>
      )}
      <div className="admin-account-preferences admin-surface">
        {setLang && (
          <label>
            Language
            <select
              value={lang}
              onChange={(event) => setLang(event.target.value)}
            >
              {enabledLanguages.map((language) => (
                <option key={language} value={language}>
                  {LANGUAGE_LABELS[language] || language}
                </option>
              ))}
            </select>
          </label>
        )}
        {onLogout && (
          <button
            type="button"
            className="admin-button admin-button-secondary text-red-700"
            onClick={onLogout}
          >
            Sign out
          </button>
        )}
      </div>
    </section>
  );
}

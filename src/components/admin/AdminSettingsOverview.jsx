import React from "react";
import {
  Building2,
  CreditCard,
  FileText,
  Printer,
  Settings2,
  ShieldCheck,
  UserRound,
  Monitor,
} from "lucide-react";

export default function AdminSettingsOverview({ canOpen, onNavigate }) {
  const entries = [
    [
      "Restaurant information",
      "Business identity, contact details, regional defaults, and branding.",
      Building2,
      "company",
    ],
    [
      "Tax & charges",
      "Tax rates, service charges, and rounding rules.",
      Settings2,
      "system-administration",
      { tab: "Tax & Charges" },
    ],
    [
      "Payment methods",
      "Providers and payment methods available at checkout.",
      CreditCard,
      "payment-providers",
    ],
    [
      "Receipt settings",
      "Business details, receipt layout, and footer preferences.",
      FileText,
      "system-administration",
      { tab: "Receipt" },
    ],
    [
      "Printer settings",
      "Receipt and kitchen printers, routing, and connection tests.",
      Printer,
      "system-administration",
      { tab: "Printer" },
    ],
    [
      "Staff permissions",
      "Company roles and the tasks each role can perform.",
      ShieldCheck,
      "roles",
    ],
    [
      "My profile",
      "Your personal name, username, and contact details.",
      UserRound,
      "profile",
    ],
    [
      "Terminals",
      "Register devices, issue activation codes, and manage device access.",
      Monitor,
      "terminals",
    ],
  ].filter(([, , , route]) => canOpen(route));
  return (
    <section className="admin-settings-overview">
      <header className="admin-page-heading">
        <div>
          <h1>Settings</h1>
          <p>Manage your restaurant, devices, payments, and account.</p>
        </div>
      </header>
      <div className="admin-settings-grid">
        {entries.map(([label, description, Icon, route, filters]) => (
          <button
            key={label}
            type="button"
            className="admin-settings-tile"
            onClick={() => onNavigate(route, filters)}
          >
            <Icon size={22} aria-hidden="true" />
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

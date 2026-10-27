import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
  TabletSmartphone,
  Users,
  Utensils,
} from "lucide-react";
import {
  initialBranches,
  initialDevices,
  initialStaff,
  permissionGroups,
  previewNav,
} from "./mockData";
import { adminModuleData, adminPanelGroups } from "./adminModuleData";
import AdminModulePage from "./AdminModulePage";
import {
  Button,
  Field,
  Modal,
  Tag,
  TextInput,
  ScreenState,
} from "./components/PreviewUi";
import PreviewShell from "./components/PreviewShell";
import { PreviewWorkspaceProvider } from "./hooks/previewWorkspace";
import { usePreviewWorkspace } from "./hooks/usePreviewWorkspace";
import { initialMembers } from "./referenceData";
import {
  CompanyProfileSettings,
  MemberDirectory,
} from "./components/CompanyAndMembers";
import {
  DeviceRegistry,
  RoleManagement,
  StaffDirectory,
} from "./components/AccessManagement";
import "./preview.css";

const base = "/preview/admin";
const allPreviewNav = [...adminPanelGroups, ...previewNav];
const pageTitles = {
  register: [
    "Welcome to RestoAdmin",
    "Create your restaurant workspace in a few steps.",
  ],
  "verify-email": [
    "Check your inbox",
    "Verify your email to continue setting up your workspace.",
  ],
  login: ["Welcome back", "Sign in to manage your restaurant workspace."],
  "reset-password": [
    "Choose a new password",
    "Update your password using the recovery link in this preview.",
  ],
  "company/create": [
    "Create your company",
    "Start with the business details that appear across your workspace.",
  ],
  "company/members": [
    "Owner & members",
    "Manage who can access this company workspace.",
  ],
  "company/settings": [
    "Company settings",
    "Your defaults apply across branches unless a branch overrides them.",
  ],
  profile: ["My profile", "Manage your personal workspace account details."],
  branches: [
    "Branches",
    "Organize locations, local settings, and branch access.",
  ],
  staff: [
    "Staff",
    "Manage staff records, branch assignments, roles, and POS PIN onboarding.",
  ],
  roles: [
    "Roles & permissions",
    "Set clear access boundaries for each team role.",
  ],
  devices: [
    "Devices",
    "Register and manage the terminals connected to your branches.",
  ],
};

const pathPage = () => {
  const path = window.location.pathname.replace(/\/$/, "");
  return path.startsWith(`${base}/`)
    ? path.slice(base.length + 1)
    : "panel/dashboard";
};
const shortName = (value = "") =>
  value
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "MS";

function AuthCard({ children, footer }) {
  return (
    <div className="preview-auth-card">
      <div className="preview-auth-mark">
        <span className="preview-logo">
          <Utensils size={20} />
        </span>
        <span>RestoAdmin POS</span>
      </div>
      {children}
      {footer && <div className="preview-auth-footer">{footer}</div>}
    </div>
  );
}

function RegisterPage({ onNext, notice, setEmail, setOwner }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!form.name.trim()) next.name = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = "Enter a valid email address.";
    if (form.password.length < 8) next.password = "Use at least 8 characters.";
    if (form.confirm !== form.password)
      next.confirm = "Passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setBusy(false);
    setEmail(form.email.trim().toLowerCase());
    setOwner({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
    });
    onNext("verify-email", "Demo account details saved in this preview.");
  };
  return (
    <div className="preview-auth-layout">
      <AuthCard
        footer={
          <>
            Already have an account?{" "}
            <button
              className="preview-text-link"
              type="button"
              onClick={() => onNext("login")}
            >
              Sign in
            </button>
          </>
        }
      >
        <p className="preview-eyebrow">GET STARTED · COMPANY OWNER</p>
        <h2>Create your account</h2>
        <p className="preview-copy">
          Create the owner login for your restaurant workspace. This is separate
          from POS staff PIN access.
        </p>
        {notice && (
          <p className="preview-inline-success" role="status">
            <CheckCircle2 size={16} />
            {notice}
          </p>
        )}
        <form className="preview-form" onSubmit={submit} noValidate>
          <Field label="Full name" error={errors.name}>
            <TextInput
              autoComplete="name"
              placeholder="e.g. Alex Tan"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </Field>
          <Field label="Work email" error={errors.email}>
            <TextInput
              icon={Mail}
              type="email"
              autoComplete="email"
              placeholder="you@restaurant.com"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
            />
          </Field>
          <Field
            label="Password"
            hint="At least 8 characters"
            error={errors.password}
          >
            <span className="preview-input-wrap">
              <LockKeyhole size={16} aria-hidden="true" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Create a password"
                value={form.password}
                onChange={(event) => update("password", event.target.value)}
              />
              <button
                type="button"
                className="preview-input-action"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </Field>
          <Field label="Confirm password" error={errors.confirm}>
            <TextInput
              icon={KeyRound}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={form.confirm}
              onChange={(event) => update("confirm", event.target.value)}
            />
          </Field>
          <Button type="submit" className="preview-full-button" disabled={busy}>
            {busy ? "Creating account…" : "Create owner account"}
            <ArrowRight size={16} />
          </Button>
          <p className="preview-legal">
            Use sample details. This preview does not create an account or store
            credentials.
          </p>
        </form>
      </AuthCard>
      <div className="preview-auth-aside">
        <div className="preview-quote-mark">“</div>
        <h3>Run your restaurant with clarity.</h3>
        <p>
          One calm workspace for your people, locations, and daily operations.
        </p>
        <div className="preview-aside-stats">
          <div>
            <strong>01</strong>
            <span>One workspace</span>
          </div>
          <div>
            <strong>∞</strong>
            <span>Room to grow</span>
          </div>
        </div>
        <div className="preview-aside-orbit orbit-one" />
        <div className="preview-aside-orbit orbit-two" />
      </div>
    </div>
  );
}

function VerifyPage({ email, onNext, notify }) {
  const [state, setState] = useState("sent");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = window.setTimeout(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const resend = async () => {
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 450));
    setBusy(false);
    setState("sent");
    setCooldown(30);
    notify(
      "Demo verification email resent. You can request another in 30 seconds.",
    );
  };
  return (
    <div className="preview-centered">
      <AuthCard
        footer={
          state === "verified" ? (
            <>
              You’re ready to continue.{" "}
              <button
                type="button"
                className="preview-text-link"
                onClick={() =>
                  onNext("login", "Email verified in this preview.")
                }
              >
                Go to sign in
              </button>
            </>
          ) : (
            <>
              Wrong email?{" "}
              <button
                type="button"
                className="preview-text-link"
                onClick={() => onNext("register")}
              >
                Back to registration
              </button>
            </>
          )
        }
      >
        <div
          className={`preview-mail-illustration ${state === "expired" ? "is-expired" : state === "verified" ? "is-verified" : ""}`}
        >
          <Mail size={28} />
          <span>
            {state === "expired" ? <Clock3 size={15} /> : <Check size={15} />}
          </span>
        </div>
        <p className="preview-eyebrow">EMAIL VERIFICATION</p>
        <h2>
          {state === "expired"
            ? "This link has expired"
            : state === "verified"
              ? "Email confirmed"
              : "Check your inbox"}
        </h2>
        <p className="preview-copy">
          {state === "expired" ? (
            "Demo links expire after 24 hours. Request a fresh email to continue."
          ) : state === "verified" ? (
            <>
              The address <strong>{email || "alex@example.test"}</strong> is
              confirmed in this preview. Continue to sign in and set up your
              workspace.
            </>
          ) : (
            <>
              We sent a verification link to{" "}
              <strong>{email || "alex@example.test"}</strong>. Confirm it before
              continuing to workspace setup.
            </>
          )}
        </p>
        {state === "sent" && (
          <div className="preview-note-box">
            <CircleHelp size={17} />
            <span>
              Didn’t get the email? Check your spam folder or resend. You can
              continue only after confirming this address.
            </span>
          </div>
        )}
        {state === "expired" && (
          <p className="preview-inline-error" role="status">
            The demo link is no longer valid.
          </p>
        )}
        {state === "verified" && (
          <p className="preview-inline-success" role="status">
            <CheckCircle2 size={16} /> Verification complete — no email was
            sent.
          </p>
        )}
        <div className="preview-stack-actions">
          {state === "verified" ? (
            <Button
              className="preview-full-button"
              onClick={() => onNext("login", "Email verified in this preview.")}
            >
              Continue to sign in
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button
              className="preview-full-button"
              onClick={() => setState("verified")}
            >
              Mark demo email as verified
              <Check size={16} />
            </Button>
          )}
          {state !== "verified" && (
            <Button
              variant="secondary"
              className="preview-full-button"
              onClick={() => setState("expired")}
            >
              Simulate expired link
            </Button>
          )}
          {state !== "verified" && (
            <button
              type="button"
              className="preview-text-link"
              onClick={resend}
              disabled={busy || cooldown > 0}
            >
              {busy
                ? "Resending…"
                : cooldown
                  ? `Resend available in ${cooldown}s`
                  : "Resend demo email"}
            </button>
          )}
        </div>
      </AuthCard>
    </div>
  );
}

function LoginPage({ email, onNext }) {
  const [form, setForm] = useState({ email: email || "", password: "" });
  const [forgot, setForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ||
      (!forgot && !form.password)
    ) {
      setError("Enter a valid email and password.");
      return;
    }
    setError("");
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setBusy(false);
    if (forgot) {
      setForgot(false);
      onNext("reset-password", `Demo recovery link sent to ${form.email}.`);
    } else
      onNext(
        "company/create",
        "Signed in using preview-only sample credentials.",
      );
  };
  return (
    <div className="preview-centered">
      <AuthCard
        footer={
          <>
            New to RestoAdmin?{" "}
            <button
              className="preview-text-link"
              type="button"
              onClick={() => onNext("register")}
            >
              Create account
            </button>
          </>
        }
      >
        <p className="preview-eyebrow">
          {forgot ? "ACCOUNT RECOVERY" : "SIGN IN"}
        </p>
        <h2>{forgot ? "Reset your password" : "Welcome back"}</h2>
        <p className="preview-copy">
          {forgot
            ? "We’ll send a demo recovery link to your inbox."
            : "Enter your details to access your workspace."}
        </p>
        {error && (
          <p className="preview-inline-error" role="alert">
            {error}
          </p>
        )}
        <form className="preview-form" onSubmit={submit} noValidate>
          <Field label="Work email">
            <TextInput
              icon={Mail}
              type="email"
              autoComplete="email"
              placeholder="you@restaurant.com"
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
          </Field>
          {!forgot && (
            <Field label="Password">
              <span className="preview-input-wrap">
                <LockKeyhole size={16} />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(event) =>
                    setForm({ ...form, password: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="preview-input-action"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </Field>
          )}
          <div className="preview-form-row">
            <label className="preview-checkbox">
              <input type="checkbox" /> Remember this device
            </label>
            {!forgot && (
              <button
                type="button"
                className="preview-text-link"
                onClick={() => {
                  setForgot(true);
                  setError("");
                }}
              >
                Forgot password?
              </button>
            )}
          </div>
          <Button type="submit" className="preview-full-button" disabled={busy}>
            {busy ? "Please wait…" : forgot ? "Send recovery link" : "Sign in"}
            <ArrowRight size={16} />
          </Button>
          {forgot && (
            <button
              type="button"
              className="preview-text-link preview-back-link"
              onClick={() => setForgot(false)}
            >
              Back to sign in
            </button>
          )}
        </form>
      </AuthCard>
    </div>
  );
}

function ResetPasswordPage({ onNext }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 450));
    setBusy(false);
    onNext(
      "login",
      "Password updated in this preview only. No account credentials were changed.",
    );
  };
  return (
    <div className="preview-centered">
      <AuthCard
        footer={
          <>
            Remembered your password?{" "}
            <button
              type="button"
              className="preview-text-link"
              onClick={() => onNext("login")}
            >
              Back to sign in
            </button>
          </>
        }
      >
        <p className="preview-eyebrow">ACCOUNT RECOVERY</p>
        <h2>Choose a new password</h2>
        <p className="preview-copy">
          Use a unique password with at least 8 characters.
        </p>
        {error && (
          <p className="preview-inline-error" role="alert">
            {error}
          </p>
        )}
        <form className="preview-form" onSubmit={submit} noValidate>
          <Field label="New password" hint="At least 8 characters">
            <span className="preview-input-wrap">
              <LockKeyhole size={16} aria-hidden="true" />
              <input
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="preview-input-action"
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow((value) => !value)}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </Field>
          <Field label="Confirm new password">
            <TextInput
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          <Button type="submit" className="preview-full-button" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
            <ArrowRight size={16} />
          </Button>
        </form>
        <p className="preview-legal">
          This is a local interaction. No password is sent or saved.
        </p>
      </AuthCard>
    </div>
  );
}

function AdminPreviewWorkspace() {
  const workspace = usePreviewWorkspace();
  const [page, setPage] = useState(pathPage());
  const [navMode, setNavMode] = useState(() =>
    pathPage().startsWith("panel/") ? "admin" : "setup",
  );
  const [theme, setTheme] = useState("light");
  const [mobileNav, setMobileNav] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("alex@example.test");
  const [owner, setOwner] = useState({
    name: "Alex Tan",
    email: "alex@example.test",
  });
  const [company, setCompany] = useState({
    name: "Resto Dining Group",
    legalName: "Resto Dining Group Sdn. Bhd.",
  });
  const [branches, setBranches] = useState(initialBranches);
  const setAvailableBranches = workspace.setAvailableBranches;
  useEffect(() => {
    setAvailableBranches(branches);
  }, [branches, setAvailableBranches]);
  const [staff, setStaff] = useState(initialStaff);
  const [devices, setDevices] = useState(initialDevices);
  const setAvailableTerminals = workspace.setAvailableTerminals;
  useEffect(() => {
    setAvailableTerminals(devices);
  }, [devices, setAvailableTerminals]);
  const [branchFilter, setBranchFilter] = useState("");
  const [branchStatus, setBranchStatus] = useState("All statuses");
  const [branchSort, setBranchSort] = useState("asc");
  const [modal, setModal] = useState(null);
  const menuBranch = workspace.branch;
  const setMenuBranch = workspace.setBranch;
  const [members, setMembers] = useState(initialMembers);
  const [modalError, setModalError] = useState("");
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [routeTick, setRouteTick] = useState(0);
  const [roleChecks, setRoleChecks] = useState({
    "Company owner": Object.fromEntries(
      permissionGroups
        .flatMap((group) => group.permissions)
        .map((permission) => [permission, true]),
    ),
    "Branch Manager": {
      "View dashboard": true,
      "View orders": true,
      "Create orders": true,
      "Manage tables": false,
      "Take payment": true,
      "Apply discounts": false,
      "Process refunds": false,
      "View reports": false,
      "Manage products": false,
      "Manage staff": false,
      "Manage devices": false,
      "Edit company settings": false,
    },
    Cashier: {
      "View dashboard": true,
      "View orders": true,
      "Create orders": true,
      "Manage tables": false,
      "Take payment": true,
      "Apply discounts": false,
      "Process refunds": false,
      "View reports": false,
      "Manage products": false,
      "Manage staff": false,
      "Manage devices": false,
      "Edit company settings": false,
    },
    Kitchen: {
      "View dashboard": false,
      "View orders": true,
      "Create orders": false,
      "Manage tables": false,
      "Take payment": false,
      "Apply discounts": false,
      "Process refunds": false,
      "View reports": false,
      "Manage products": false,
      "Manage staff": false,
      "Manage devices": false,
      "Edit company settings": false,
    },
  });

  const setIdentity = workspace.setIdentity;
  useEffect(() => {
    setIdentity({ actor: owner.name, company: company.name });
  }, [owner.name, company.name, setIdentity]);
  const setPermissionProfiles = workspace.setPermissionProfiles;
  useEffect(() => {
    setPermissionProfiles(roleChecks);
  }, [roleChecks, setPermissionProfiles]);
  useEffect(() => {
    document.body.classList.add("preview-mode");
    const sync = () => {
      const nextPage = pathPage();
      setPage(nextPage);
      setNavMode(nextPage.startsWith("panel/") ? "admin" : "setup");
    };
    window.addEventListener("popstate", sync);
    return () => {
      document.body.classList.remove("preview-mode");
      window.removeEventListener("popstate", sync);
    };
  }, []);
  useEffect(() => {
    if (
      !pageTitles[page] &&
      !(page.startsWith("panel/") && adminModuleData[page.slice(6)])
    ) {
      window.history.replaceState(null, "", `${base}/register`);
      setPage("register");
    }
  }, [page]);
  useEffect(() => {
    if (message) {
      const timer = window.setTimeout(() => setMessage(""), 3600);
      return () => window.clearTimeout(timer);
    }
  }, [message]);

  const performNavigation = (next, notice = "") => {
    const target = new URL(`${base}/${next}`, window.location.origin);
    const nextPage = target.pathname.slice(base.length + 1);
    window.history.pushState(null, "", target.pathname + target.search);
    setPage(nextPage);
    setNavMode(nextPage.startsWith("panel/") ? "admin" : "setup");
    setMobileNav(false);
    setMessage(notice);
    setModal(null);
    setRouteTick((value) => value + 1);
    workspace.setScreenState("default");
  };
  const navigate = (next, notice = "") => {
    if (workspace.dirty) {
      setPendingNavigation({ next, notice });
      return;
    }
    performNavigation(next, notice);
  };
  const notify = (notice) => setMessage(notice);
  const activeTitle =
    allPreviewNav
      .flatMap((group) => group.items)
      .find(([id]) => id === page)?.[1] ||
    pageTitles[page]?.[0] ||
    "Preview";
  const moduleId = page.startsWith("panel/") ? page.slice(6) : "";
  const title =
    pageTitles[page] ||
    (moduleId
      ? [
          activeTitle,
          adminModuleData[moduleId]?.description || "Admin module preview.",
        ]
      : pageTitles.register);
  const headingGroup =
    allPreviewNav.find((group) => group.items.some(([id]) => id === page))
      ?.group || "ACCESS CONTROL";
  const filteredBranches = useMemo(
    () =>
      branches
        .filter(
          (branch) =>
            `${branch.name} ${branch.code} ${branch.address}`
              .toLowerCase()
              .includes(branchFilter.toLowerCase()) &&
            (branchStatus === "All statuses" || branch.status === branchStatus),
        )
        .sort((a, b) =>
          branchSort === "asc"
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name),
        ),
    [branches, branchFilter, branchSort, branchStatus],
  );
  const renderContent = () => {
    const restricted = {
      "panel/company": "Edit company settings",
      "company/settings": "Edit company settings",
      "company/create": "Edit company settings",
      "panel/branches": "Edit company settings",
      branches: "Edit company settings",
      "panel/users": "Manage staff",
      staff: "Manage staff",
      "panel/roles": "Manage staff",
      roles: "Manage staff",
      "panel/terminals": "Manage devices",
      devices: "Manage devices",
      "company/members": "Manage staff",
    }[page];
    if (
      workspace.role === "Manager" &&
      restricted &&
      !workspace.can(restricted)
    )
      return (
        <ScreenState
          state="access-denied"
          onReset={() => workspace.setRole("Owner")}
        />
      );

    if (page === "register")
      return (
        <RegisterPage
          onNext={navigate}
          notice={message}
          setEmail={setEmail}
          setOwner={setOwner}
        />
      );
    if (page === "verify-email")
      return <VerifyPage email={email} onNext={navigate} notify={notify} />;
    if (page === "login") return <LoginPage email={email} onNext={navigate} />;
    if (page === "reset-password")
      return <ResetPasswordPage onNext={navigate} />;
    if (page === "company/create")
      return (
        <CompanyCreatePage
          company={company}
          onSave={(next) => {
            if (workspace.readOnly) return;
            setCompany(next);
            navigate(
              "company/members",
              "Company profile created in mock preview.",
            );
          }}
        />
      );
    if (page === "company/members")
      return (
        <MemberDirectory
          company={company}
          members={members}
          owner={owner}
          branches={branches}
          onChange={setMembers}
          notify={notify}
          onInvite={() => {
            setModalError("");
            setModal({ type: "member" });
          }}
        />
      );
    if (page === "company/settings" || moduleId === "company")
      return (
        <CompanyProfileSettings
          company={company}
          onSave={(next) => {
            if (workspace.readOnly) return;
            setCompany(next);
            notify("Settings saved in this preview.");
          }}
        />
      );
    if (page === "profile")
      return (
        <ProfileSettingsPage
          owner={owner}
          onSave={(next) => {
            if (workspace.readOnly) return;
            setOwner(next);
            setEmail(next.email);
            notify("Personal profile saved in this preview.");
          }}
        />
      );
    if (page === "branches" || moduleId === "branches")
      return (
        <BranchesPage
          branches={filteredBranches.map((branch) => ({
            ...branch,
            devices: devices.filter((device) => device.branch === branch.name)
              .length,
          }))}
          readOnly={workspace.readOnly}
          query={branchFilter}
          setQuery={setBranchFilter}
          status={branchStatus}
          setStatus={setBranchStatus}
          sort={branchSort}
          onSort={() =>
            setBranchSort((current) => (current === "asc" ? "desc" : "asc"))
          }
          selected={menuBranch}
          setSelected={setMenuBranch}
          onEdit={(branch) => setModal({ type: "branch", branch })}
        />
      );
    if (page === "staff" || moduleId === "users")
      return (
        <StaffDirectory
          staff={staff}
          branches={branches}
          roles={roleChecks}
          onChange={setStaff}
          notify={notify}
        />
      );
    if (page === "roles" || moduleId === "roles")
      return (
        <RoleManagement
          roles={roleChecks}
          onChange={setRoleChecks}
          notify={notify}
        />
      );
    if (page === "devices" || moduleId === "terminals")
      return (
        <DeviceRegistry
          devices={devices}
          branches={branches}
          onChange={setDevices}
          notify={notify}
        />
      );
    if (moduleId)
      return (
        <AdminModulePage
          key={`${moduleId}:${routeTick}`}
          moduleId={moduleId}
          notify={notify}
          navigate={navigate}
        />
      );
    return null;
  };

  const saveModal = (event) => {
    event.preventDefault();
    setModalError("");
    if (
      !workspace.canEdit(
        {
          branch: "branches",
          staff: "users",
          member: "users",
          device: "terminals",
        }[modal.type],
      )
    ) {
      setModalError("Your preview role cannot change these records.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const value = (key) => String(form.get(key) || "").trim();
    if (modal.type === "branch") {
      const next = {
        ...modal.branch,
        id: modal.branch?.id || crypto.randomUUID(),
        name: value("name"),
        code: value("code").toUpperCase(),
        address: value("address"),
        manager: value("manager"),
        status: value("status"),
        operatingModel: value("operatingModel"),
        timezone: value("timezone"),
        currency: value("currency"),
        tax: value("tax"),
        devices: modal.branch?.devices || 0,
      };
      if (!next.name || !/^[A-Z0-9-]{2,16}$/.test(next.code)) {
        setModalError(
          "Enter a branch name and a code containing 2–16 letters, numbers, or hyphens.",
        );
        return;
      }
      if (
        branches.some(
          (branch) =>
            branch.id !== next.id &&
            (branch.code.toLowerCase() === next.code.toLowerCase() ||
              branch.name.toLowerCase() === next.name.toLowerCase()),
        )
      ) {
        setModalError("Branch name and code must be unique.");
        return;
      }
      if (
        next.status !== "Active" &&
        devices.some(
          (device) =>
            device.branch === modal.branch?.name && device.status === "Active",
        )
      ) {
        setModalError(
          "Disable active terminals before making this branch inactive or returning it to setup.",
        );
        return;
      }
      if (modal.branch && modal.branch.name !== next.name) {
        const old = modal.branch.name;
        setStaff((current) =>
          current.map((person) => ({
            ...person,
            branch: person.branch === old ? next.name : person.branch,
            additionalBranches: (person.additionalBranches || []).map((name) =>
              name === old ? next.name : name,
            ),
          })),
        );
        setDevices((current) =>
          current.map((device) =>
            device.branch === old ? { ...device, branch: next.name } : device,
          ),
        );
        setMembers((current) =>
          current.map((member) =>
            member.branch === old ? { ...member, branch: next.name } : member,
          ),
        );
        workspace.renameBranch(old, next.name);
      }
      setBranches((current) =>
        modal.branch
          ? current.map((branch) => (branch.id === next.id ? next : branch))
          : [...current, next],
      );
      workspace.recordActivity("BRANCH_SAVED", next.name);
      notify("Branch saved with regional and operational settings.");
    } else if (modal.type === "member") {
      const member = {
        id: crypto.randomUUID(),
        name: value("name"),
        email: value("email").toLowerCase(),
        role: value("role"),
        branch: value("branch"),
        status: "Pending",
      };
      if (!member.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) {
        setModalError("Enter a name and valid email.");
        return;
      }
      if (
        [...members, owner].some(
          (row) => row.email.toLowerCase() === member.email,
        )
      ) {
        setModalError("This email already belongs to a company member.");
        return;
      }
      setMembers((current) => [member, ...current]);
      workspace.recordActivity("MEMBER_INVITED", member.name);
      notify("Sample member invitation recorded. No email was sent.");
    } else if (modal.type === "staff") {
      const person = {
        id: crypto.randomUUID(),
        name: value("name"),
        employeeId: value("employeeId").toUpperCase(),
        email: value("email"),
        role: value("role"),
        branch: value("branch"),
        additionalBranches: form
          .getAll("additionalBranches")
          .map(String)
          .filter((name) => name !== value("branch")),
        posAccess: form.get("posAccess") === "on",
        status: "Pending",
        pinReady: false,
      };
      if (!person.name || !person.employeeId) {
        setModalError("Name and employee ID are required.");
        return;
      }
      if (
        staff.some(
          (row) =>
            row.employeeId.toLowerCase() === person.employeeId.toLowerCase(),
        )
      ) {
        setModalError("Employee ID must be unique.");
        return;
      }
      setStaff((current) => [person, ...current]);
      workspace.recordActivity("STAFF_CREATED", person.employeeId);
      notify(
        "Staff record created. Complete sample PIN setup under Staff Management.",
      );
    } else if (modal.type === "device") {
      const device = {
        id: crypto.randomUUID(),
        name: value("name"),
        code: value("code").toUpperCase(),
        type: value("type"),
        branch: value("branch"),
        status: "Pending",
        lastSeen: "Not activated",
        history: [],
      };
      if (!device.name || !device.code) {
        setModalError("Terminal name and code are required.");
        return;
      }
      if (
        devices.some(
          (row) => row.code.toLowerCase() === device.code.toLowerCase(),
        )
      ) {
        setModalError("Terminal code must be unique.");
        return;
      }
      setDevices((current) => [device, ...current]);
      workspace.recordActivity("TERMINAL_CREATED", device.code);
      notify(
        "Terminal registered. Open Manage terminal to issue its activation code.",
      );
    }
    setModal(null);
  };

  const foundationModule = [
    "company",
    "branches",
    "users",
    "roles",
    "terminals",
  ].includes(moduleId);
  const authPage = [
    "register",
    "verify-email",
    "login",
    "reset-password",
  ].includes(page);
  return (
    <PreviewShell
      page={page}
      navMode={navMode}
      company={company}
      owner={owner}
      branches={branches}
      activeTitle={activeTitle}
      navigate={navigate}
      theme={theme}
      setTheme={setTheme}
      mobileNav={mobileNav}
      setMobileNav={setMobileNav}
      message={message}
      dismissMessage={() => setMessage("")}
      notify={notify}
    >
      <main
        id="preview-main"
        className={`preview-content ${authPage ? "is-auth-page" : ""}`}
      >
        {!authPage && (!moduleId || foundationModule) && (
          <div className="preview-page-heading">
            <div>
              <p className="preview-eyebrow">
                {page.startsWith("company/") || moduleId === "company"
                  ? "COMPANY WORKSPACE"
                  : headingGroup}
              </p>
              <h1>{title[0]}</h1>
              <p>{title[1]}</p>
            </div>
            {["branches", "panel/branches"].includes(page) && (
              <Button
                icon={Plus}
                disabled={!workspace.canEdit("branches")}
                onClick={() => {
                  setModalError("");
                  setModal({ type: "branch" });
                }}
              >
                Add branch
              </Button>
            )}
            {["staff", "panel/users"].includes(page) && (
              <Button
                icon={Plus}
                disabled={!workspace.canEdit("users")}
                onClick={() => {
                  setModalError("");
                  setModal({ type: "staff" });
                }}
              >
                Create staff record
              </Button>
            )}
            {["devices", "panel/terminals"].includes(page) && (
              <Button
                icon={Plus}
                disabled={!workspace.canEdit("terminals")}
                onClick={() => {
                  setModalError("");
                  setModal({ type: "device" });
                }}
              >
                Register terminal
              </Button>
            )}
          </div>
        )}
        {workspace.screenState !== "default" ? (
          <ScreenState
            state={workspace.screenState}
            onReset={() => workspace.setScreenState("default")}
          />
        ) : (
          renderContent()
        )}
      </main>
      {modal && (
        <PreviewModal
          modal={modal}
          error={modalError}
          branches={branches}
          roles={Object.keys(roleChecks).filter(
            (name) => name !== "Company owner",
          )}
          readOnly={workspace.readOnly}
          onClose={() => {
            setModal(null);
            setModalError("");
          }}
          onSubmit={saveModal}
        />
      )}
      {pendingNavigation && (
        <Modal
          title="Leave with unsaved changes?"
          description="Your changes have not been saved to the sample workspace."
          onClose={() => setPendingNavigation(null)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setPendingNavigation(null)}
              >
                Keep editing
              </Button>
              <Button
                onClick={() => {
                  workspace.setDirty(false);
                  performNavigation(
                    pendingNavigation.next,
                    pendingNavigation.notice,
                  );
                  setPendingNavigation(null);
                }}
              >
                Discard & leave
              </Button>
            </>
          }
        >
          <p className="preview-muted">
            Save the form to keep your changes, or discard them to continue.
          </p>
        </Modal>
      )}
    </PreviewShell>
  );
}

function CompanyCreatePage({ company, onSave }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: company.name,
    legalName: company.legalName,
    registration: "",
    country: "Malaysia",
    currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Company name is required.");
      return;
    }
    setError("");
    if (step === 1) {
      setStep(2);
      return;
    }
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 450));
    setBusy(false);
    onSave(form);
  };
  return (
    <section className="preview-card preview-company-create">
      <div className="preview-card-heading">
        <div className="preview-step-number">0{step}</div>
        <div>
          <h2>{step === 1 ? "Company profile" : "Review company details"}</h2>
          <p>
            {step === 1
              ? "Start with the details used across your restaurant workspace."
              : "Check the company identity and regional defaults before continuing."}
          </p>
        </div>
        <span className="preview-step-status">Step {step} of 2</span>
      </div>
      <div className="preview-progress" aria-label={`Step ${step} of 2`}>
        <span style={{ width: step === 1 ? "50%" : "100%" }} />
      </div>
      {step === 1 ? (
        <form
          className="preview-form preview-two-columns"
          onSubmit={submit}
          noValidate
        >
          <Field label="Company name" error={error}>
            <TextInput
              autoFocus
              placeholder="e.g. Resto Dining Group"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </Field>
          <Field label="Legal business name">
            <TextInput
              placeholder="As registered with authorities"
              value={form.legalName}
              onChange={(event) =>
                setForm({ ...form, legalName: event.target.value })
              }
            />
          </Field>
          <Field label="Registration number">
            <TextInput
              placeholder="Optional"
              value={form.registration}
              onChange={(event) =>
                setForm({ ...form, registration: event.target.value })
              }
            />
          </Field>
          <Field label="Country">
            <select
              value={form.country}
              onChange={(event) => {
                const country = event.target.value;
                setForm({
                  ...form,
                  country,
                  currency:
                    country === "Malaysia"
                      ? "MYR"
                      : country === "Singapore"
                        ? "SGD"
                        : "THB",
                  timezone:
                    country === "Malaysia"
                      ? "Asia/Kuala_Lumpur"
                      : country === "Singapore"
                        ? "Asia/Singapore"
                        : "Asia/Bangkok",
                });
              }}
            >
              <option>Malaysia</option>
              <option>Singapore</option>
              <option>Thailand</option>
            </select>
          </Field>
          <Field label="Default currency">
            <select
              value={form.currency}
              onChange={(event) =>
                setForm({ ...form, currency: event.target.value })
              }
            >
              <option value="MYR">MYR · Malaysian Ringgit</option>
              <option value="SGD">SGD · Singapore Dollar</option>
              <option value="THB">THB · Thai Baht</option>
            </select>
          </Field>
          <Field label="Timezone">
            <select
              value={form.timezone}
              onChange={(event) =>
                setForm({ ...form, timezone: event.target.value })
              }
            >
              <option>Asia/Kuala_Lumpur</option>
              <option>Asia/Singapore</option>
              <option>Asia/Bangkok</option>
            </select>
          </Field>
          <div className="preview-form-footer preview-span-two">
            <span>
              <Shield size={15} /> Workspace details stay within this mock
              preview.
            </span>
            <Button type="submit">
              Review details
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      ) : (
        <form className="preview-form" onSubmit={submit}>
          <dl className="preview-review-grid">
            {[
              ["Company name", form.name],
              ["Legal name", form.legalName || "Not provided"],
              ["Registration number", form.registration || "Not provided"],
              ["Country", form.country],
              ["Currency", form.currency],
              ["Timezone", form.timezone],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="preview-note-box">
            <Shield size={16} />
            <span>
              This is a design preview. Continuing updates only local mock
              state; no company is created in the production system.
            </span>
          </div>
          <div className="preview-form-footer">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep(1)}
            >
              Back to edit
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving preview…" : "Confirm company details"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function ProfileSettingsPage({ owner, onSave }) {
  const workspace = usePreviewWorkspace();
  const [form, setForm] = useState(owner);
  const setDirty = workspace.setDirty;
  const dirty = JSON.stringify(form) !== JSON.stringify(owner);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    onSave({ name: form.name.trim(), email: form.email.trim().toLowerCase() });
    setSaved(true);
  };
  return (
    <section className="preview-card preview-profile-settings">
      <div className="preview-section-heading">
        <div>
          <h2>Personal account</h2>
          <p>
            These details belong to your owner account, not the company profile.
          </p>
        </div>
        <span className="preview-avatar preview-avatar-large">
          {shortName(form.name)}
        </span>
      </div>
      <form className="preview-form" onSubmit={submit} noValidate>
        <div className="preview-two-columns">
          <Field
            label="Full name"
            error={error && !form.name.trim() ? error : ""}
          >
            <TextInput
              autoComplete="name"
              value={form.name}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }));
                setSaved(false);
              }}
            />
          </Field>
          <Field
            label="Email address"
            error={
              error && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
                ? error
                : ""
            }
          >
            <TextInput
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  email: event.target.value,
                }));
                setSaved(false);
              }}
            />
          </Field>
        </div>
        <div className="preview-form-footer">
          <span>
            {saved && (
              <>
                <CheckCircle2 size={15} /> Profile saved in preview state
              </>
            )}
          </span>
          <Button type="submit" disabled={!dirty || workspace.readOnly}>
            Save profile
          </Button>
        </div>
      </form>
      <div className="preview-info-card">
        <div className="preview-info-icon">
          <Shield size={18} />
        </div>
        <div>
          <strong>Company settings are managed separately</strong>
          <p>
            Currency, tax defaults, receipt details, and branding remain under
            Company settings.
          </p>
        </div>
      </div>
    </section>
  );
}

function BranchesPage({
  readOnly,
  branches,
  query,
  setQuery,
  status,
  setStatus,
  sort,
  onSort,
  selected,
  setSelected,
  onEdit,
}) {
  const allCount =
    status === "All statuses" && !query ? branches.length : undefined;
  return (
    <div className="preview-stack">
      <div className="preview-stat-grid">
        <Stat
          label="Branches shown"
          value={String(branches.length).padStart(2, "0")}
          hint={
            allCount === undefined
              ? "Matches current filters"
              : "Across all locations"
          }
          icon={Building2}
        />
        <Stat
          label="Active locations"
          value={String(
            branches.filter((branch) => branch.status === "Active").length,
          ).padStart(2, "0")}
          hint="Ready for service"
          icon={CheckCircle2}
        />
        <Stat
          label="Devices assigned"
          value={String(
            branches.reduce((total, branch) => total + branch.devices, 0),
          ).padStart(2, "0")}
          hint="Across locations shown"
          icon={Laptop}
        />
      </div>
      <section className="preview-card">
        <div className="preview-toolbar preview-toolbar-wrap">
          <label className="preview-search">
            <Search size={16} />
            <input
              aria-label="Search branches by name, code, or address"
              placeholder="Search branches…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="Filter branches by status"
            className="preview-select-compact"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {["All statuses", "Active", "Setup", "Inactive"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <Button variant="secondary" icon={ArrowDownUp} onClick={onSort}>
            Name {sort === "asc" ? "A–Z" : "Z–A"}
          </Button>
          <span className="preview-result-count">
            {branches.length} locations
          </span>
        </div>
        <div className="preview-branch-grid">
          {branches.map((branch) => (
            <article
              key={branch.id}
              className={`preview-branch-card ${selected === branch.name ? "is-selected" : ""}`}
            >
              <div className="preview-branch-card-top">
                <span className="preview-branch-mark">
                  <Building2 size={19} />
                </span>
                <button
                  className="preview-icon-button"
                  type="button"
                  aria-label={`Edit ${branch.name}`}
                  disabled={readOnly}
                  onClick={() => onEdit(branch)}
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
              <div className="preview-branch-label-row">
                <span className="preview-code">{branch.code}</span>
                <Tag
                  tone={
                    branch.status === "Active"
                      ? "green"
                      : branch.status === "Setup"
                        ? "amber"
                        : "neutral"
                  }
                >
                  {branch.status}
                </Tag>
              </div>
              <h3>{branch.name}</h3>
              <p>{branch.address}</p>
              <div className="preview-branch-meta">
                <span>
                  <Users size={14} />
                  {branch.manager}
                </span>
                <span>
                  <TabletSmartphone size={14} />
                  {branch.devices} devices
                </span>
              </div>
              <button
                type="button"
                className="preview-branch-select"
                onClick={() => setSelected(branch.name)}
              >
                {selected === branch.name
                  ? "Selected branch"
                  : "Set as current branch"}
                {selected === branch.name ? (
                  <Check size={14} />
                ) : (
                  <ArrowRight size={14} />
                )}
              </button>
            </article>
          ))}
        </div>
        {branches.length === 0 && (
          <div className="preview-empty">
            <Search size={20} />
            <strong>No branches match</strong>
            <span>Try another status or clear your search.</span>
            <button
              className="preview-text-link"
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("All statuses");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, icon: Icon }) {
  return (
    <section className="preview-stat-card">
      <span className="preview-stat-icon">
        <Icon size={17} />
      </span>
      <span className="preview-stat-label">{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </section>
  );
}

function PreviewModal({
  modal,
  error,
  branches,
  roles,
  readOnly,
  onClose,
  onSubmit,
}) {
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const requestClose = () => (dirty ? setDiscard(true) : onClose());
  const isBranch = modal.type === "branch";
  const isStaff = modal.type === "staff";
  const isMember = modal.type === "member";
  const branch = modal.branch || {};
  const [primaryBranch, setPrimaryBranch] = useState(
    branches.find((item) => item.status === "Active")?.name ||
      branches[0]?.name ||
      "",
  );
  const titles = {
    branch: branch.id ? "Edit branch" : "Add branch",
    staff: "Create staff record",
    member: "Invite company member",
    device: "Register terminal",
  };
  const submitLabel = isBranch
    ? "Save branch"
    : isStaff
      ? "Create staff record"
      : isMember
        ? "Create sample invitation"
        : "Register terminal";
  return (
    <Modal
      title={titles[modal.type]}
      description={
        isStaff
          ? "Assign operational access first. PIN setup follows after the staff record is created."
          : isMember
            ? "Company membership is separate from a POS staff record."
            : "Company → branch → terminal · changes stay in this mock workspace."
      }
      onClose={requestClose}
      footer={
        discard ? (
          <>
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
            <Button type="submit" form="preview-modal-form" disabled={readOnly}>
              {submitLabel}
            </Button>
          </>
        )
      }
    >
      <form
        id="preview-modal-form"
        className="preview-form"
        onSubmit={onSubmit}
      >
        {discard && (
          <p className="preview-inline-error" role="alert">
            Discard this form? These changes have not been saved.
          </p>
        )}
        {error && (
          <p className="preview-inline-error" role="alert">
            {error}
          </p>
        )}
        <fieldset
          className="preview-form-fieldset"
          disabled={readOnly}
          onChange={() => {
            setDirty(true);
            setDiscard(false);
          }}
        >
          {isBranch ? (
            <>
              <div className="preview-form-section-label">Branch identity</div>
              <Field label="Branch name">
                <TextInput
                  required
                  name="name"
                  defaultValue={branch.name || ""}
                  placeholder="e.g. Mont Kiara"
                />
              </Field>
              <div className="preview-two-columns">
                <Field label="Branch code">
                  <TextInput
                    required
                    name="code"
                    maxLength={16}
                    defaultValue={branch.code || ""}
                    placeholder="KL-03"
                  />
                </Field>
                <Field label="Status">
                  <select name="status" defaultValue={branch.status || "Setup"}>
                    <option>Setup</option>
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </Field>
              </div>
              <Field label="Address">
                <TextInput name="address" defaultValue={branch.address || ""} />
              </Field>
              <div className="preview-form-section-label">Operations</div>
              <div className="preview-two-columns">
                <Field label="Operating model">
                  <select
                    name="operatingModel"
                    defaultValue={branch.operatingModel || "Full service"}
                  >
                    <option>Full service</option>
                    <option>Quick service</option>
                    <option>Kiosk</option>
                  </select>
                </Field>
                <Field label="Branch manager">
                  <select
                    name="manager"
                    defaultValue={branch.manager || "Unassigned"}
                  >
                    <option>Unassigned</option>
                    <option>Farah Lim</option>
                    <option>Daniel Tan</option>
                    <option>Aisha Rahman</option>
                  </select>
                </Field>
              </div>
              <div className="preview-form-section-label">Regional & tax</div>
              <div className="preview-two-columns">
                <Field label="Timezone">
                  <select
                    name="timezone"
                    defaultValue={branch.timezone || "Asia/Kuala_Lumpur"}
                  >
                    <option>Asia/Kuala_Lumpur</option>
                    <option>Asia/Singapore</option>
                    <option>Asia/Bangkok</option>
                  </select>
                </Field>
                <Field label="Currency">
                  <select
                    name="currency"
                    defaultValue={branch.currency || "MYR"}
                  >
                    <option>MYR</option>
                    <option>SGD</option>
                    <option>THB</option>
                  </select>
                </Field>
                <Field label="Tax profile">
                  <select
                    name="tax"
                    defaultValue={branch.tax || "SST service tax"}
                  >
                    <option>SST service tax</option>
                    <option>SST sales tax</option>
                    <option>GST</option>
                    <option>VAT</option>
                    <option>Tax exempt</option>
                  </select>
                </Field>
              </div>
            </>
          ) : (
            <>
              <Field
                label={modal.type === "device" ? "Terminal name" : "Full name"}
              >
                <TextInput required name="name" />
              </Field>
              {modal.type === "device" ? (
                <>
                  <div className="preview-two-columns">
                    <Field label="Terminal code">
                      <TextInput
                        required
                        name="code"
                        placeholder="POS-KL01-03"
                        maxLength={24}
                      />
                    </Field>
                    <Field label="Device type">
                      <select name="type">
                        <option>POS terminal</option>
                        <option>Kitchen display</option>
                        <option>Self-service kiosk</option>
                      </select>
                    </Field>
                  </div>
                </>
              ) : (
                <>
                  {isStaff && (
                    <Field
                      label="Employee ID"
                      hint="Used with a PIN at the POS."
                    >
                      <TextInput
                        required
                        name="employeeId"
                        placeholder="EMP-006"
                        maxLength={24}
                      />
                    </Field>
                  )}
                  <Field
                    label={isStaff ? "Contact email (optional)" : "Work email"}
                  >
                    <TextInput
                      name="email"
                      type="email"
                      required={isMember}
                      placeholder="name@example.test"
                    />
                  </Field>
                  <Field
                    label={isMember ? "Workspace role" : "Operational role"}
                  >
                    <select name="role">
                      {(isMember
                        ? ["Company admin", "Branch manager", "Read only"]
                        : [...new Set([...roles, "Waiter"])]
                      ).map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
              <Field
                label={
                  isMember
                    ? "Branch scope"
                    : isStaff
                      ? "Primary branch"
                      : "Assign branch"
                }
              >
                <select
                  name="branch"
                  value={primaryBranch}
                  onChange={(event) => setPrimaryBranch(event.target.value)}
                >
                  {isMember && <option>All branches</option>}
                  {branches.map((branch) => (
                    <option key={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </Field>
              {isStaff && (
                <>
                  <fieldset className="preview-permission-group">
                    <legend>Additional branch access</legend>
                    {branches
                      .filter((branch) => branch.name !== primaryBranch)
                      .map((branch) => (
                        <label key={branch.id} className="preview-checkbox">
                          <input
                            type="checkbox"
                            name="additionalBranches"
                            value={branch.name}
                          />
                          {branch.name}
                        </label>
                      ))}
                  </fieldset>
                  <label className="preview-checkbox">
                    <input type="checkbox" name="posAccess" defaultChecked />
                    Enable POS access at assigned branches
                  </label>
                  <div className="preview-note-box">
                    <KeyRound size={18} />
                    <span>
                      Created as Pending · PIN setup required. No company login
                      or invitation is created. Complete the sample PIN setup in
                      the staff directory.
                    </span>
                  </div>
                </>
              )}
              {modal.type === "device" && (
                <div className="preview-note-box">
                  <LockKeyhole size={18} />
                  <span>
                    Registered as Pending. Issue a temporary code from Manage
                    terminal, then simulate activation of the physical device.
                  </span>
                </div>
              )}
              {isMember && (
                <p className="preview-hint">
                  A pending sample invitation is added to the company member
                  directory. No email is sent.
                </p>
              )}
            </>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}

export default function AdminPreviewApp() {
  return (
    <PreviewWorkspaceProvider>
      <AdminPreviewWorkspace />
    </PreviewWorkspaceProvider>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import AppSidebar from "@/components/app-sidebar";
import { readOwnerDirectoryPages } from "@/lib/owner-directory-pages";
import { OwnerInvoices } from "./owner-invoices";
import { OwnerBranch, OwnerPackageDirectory } from "./owner-package-directory";
import { ApiClientError, apiRequest } from "@/lib/api";
import { ClinicLoginResult, ClinicSessionProfile } from "@/lib/clinic-session";
import {
  clearOwnerSession,
  OwnerSession,
  readOwnerSession,
  renewOwnerSession,
} from "@/lib/owner-session";

type Organization = {
  id: string;
  name: string;
  subdomain: string | null;
  status: string;
  branchCount: number;
};
type AccessState = "loading" | "owner" | "forbidden";
const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
const branchPath = (id: string) =>
  `/owner/organizations/${encodeURIComponent(id)}/branches?sortBy=name&sortOrder=asc`;

export default function OwnerOrganizationWorkspace() {
  const [profile, setProfile] = useState<ClinicSessionProfile | null>(null);
  const [ownerSession, setOwnerSession] = useState<OwnerSession | null>(null);
  const [access, setAccess] = useState<AccessState>("loading");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [branches, setBranches] = useState<OwnerBranch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = readOwnerSession();
    if (!stored) {
      window.location.replace("/login");
      return;
    }
    let cancelled = false;
    async function load(current: OwnerSession) {
      const path = "/owner/organizations?limit=100&sortBy=name&sortOrder=asc";
      const result = await apiRequest<Organization[]>(path, {
        token: current.accessToken,
      }).catch(async (cause: unknown) => {
        if (!(cause instanceof ApiClientError) || cause.status !== 401)
          throw cause;
        current = await renewOwnerSession(current);
        return apiRequest<Organization[]>(path, { token: current.accessToken });
      });
      const requestedId = new URLSearchParams(window.location.search).get(
        "organizationId",
      );
      const subdomain = window.location.hostname.split(".")[0];
      const preferred =
        result.data.find((org) => org.subdomain === subdomain) ??
        result.data.find((org) => org.id === requestedId) ??
        result.data[0];
      const ownedBranches = preferred
        ? await readOwnerDirectoryPages<OwnerBranch>(
            branchPath(preferred.id),
            current.accessToken,
          )
        : [];
      if (cancelled) return;
      setOwnerSession(current);
      setOrganizations(result.data);
      setSelectedOrganizationId(preferred?.id ?? "");
      setBranches(ownedBranches);
      const saved = window.localStorage.getItem("klinic-test-profile");
      if (saved && window.localStorage.getItem("klinic-test-token")) {
        try {
          const clinicProfile = JSON.parse(saved) as ClinicSessionProfile;
          if (
            ownedBranches.some(
              (branch) =>
                branch.code === clinicProfile.clinicCode && branch.canEnter,
            )
          )
            setProfile(clinicProfile);
        } catch {
          /* The Owner workspace does not depend on a saved clinic profile. */
        }
      }
      setAccess("owner");
    }
    void load(stored).catch((cause: unknown) => {
      if (cancelled) return;
      if (cause instanceof ApiClientError && cause.status === 401)
        clearOwnerSession();
      setError(errorText(cause));
      setAccess("forbidden");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadBranches = useCallback(
    async (organizationId: string) => {
      if (!ownerSession) return;
      setBusy(true);
      setError("");
      try {
        const results = await readOwnerDirectoryPages<OwnerBranch>(
          branchPath(organizationId),
          ownerSession.accessToken,
        );
        setSelectedOrganizationId(organizationId);
        setBranches(results);
      } catch (cause) {
        setError(errorText(cause));
      } finally {
        setBusy(false);
      }
    },
    [ownerSession],
  );

  async function switchClinic(clinicId: string, code: string) {
    if (!ownerSession) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<ClinicLoginResult>(
        `/owner/branches/${encodeURIComponent(clinicId)}/session`,
        { method: "POST", token: ownerSession.accessToken },
      );
      const nextProfile: ClinicSessionProfile = {
        name: result.data.user.email,
        clinicCode: code,
        roles: result.data.user.roles,
      };
      window.localStorage.setItem("klinic-test-token", result.data.accessToken);
      window.localStorage.setItem(
        "klinic-test-profile",
        JSON.stringify(nextProfile),
      );
      window.location.replace("/dashboard");
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }

  const selected = organizations.find(
    (item) => item.id === selectedOrganizationId,
  );
  return (
    <main
      className={
        profile
          ? "app-shell owner-organization-app"
          : "owner-organization-app owner-only-workspace"
      }
    >
      {profile && <AppSidebar active="organization" profile={profile} />}
      <section className="workspace">
        <header className="topbar owner-organization-topbar">
          <h1>องค์กรและสาขา</h1>
          {ownerSession && !profile && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                clearOwnerSession();
                window.localStorage.removeItem("klinic-test-token");
                window.localStorage.removeItem("klinic-test-profile");
                window.location.replace("/login");
              }}
            >
              ออกจากระบบ
            </button>
          )}
        </header>
        <div className="content owner-organization-content">
          {access === "loading" && (
            <section className="owner-state-card">
              <h2>กำลังโหลดข้อมูลองค์กร</h2>
            </section>
          )}
          {access === "forbidden" && (
            <section className="owner-state-card forbidden">
              <h2>เปิดหน้าจัดการองค์กรไม่ได้</h2>
              <p>{error}</p>
              <a href="/login">เข้าสู่ระบบใหม่</a>
            </section>
          )}
          {access === "owner" && (
            <>
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
              {selected && (
                <section
                  className="owner-organization-context"
                  aria-label="องค์กรปัจจุบัน"
                >
                  <div>
                    <h2>{selected.name}</h2>
                    <p>
                      {selected.subdomain && `${selected.subdomain} · `}
                      {branches.length} สาขา
                    </p>
                  </div>
                  {organizations.length > 1 && (
                    <label>
                      องค์กร
                      <select
                        value={selectedOrganizationId}
                        disabled={busy}
                        onChange={(event) =>
                          void loadBranches(event.target.value)
                        }
                      >
                        {organizations.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </section>
              )}
              {ownerSession && selected && (
                <>
                  <OwnerPackageDirectory
                    key={`packages:${selected.id}`}
                    token={ownerSession.accessToken}
                    organizationId={selected.id}
                    ownerEmail={ownerSession.owner.email}
                    branches={branches}
                    currentClinicCode={profile?.clinicCode}
                    switching={busy}
                    onEnter={(clinicId, code) =>
                      void switchClinic(clinicId, code)
                    }
                    onChanged={() => loadBranches(selected.id)}
                  />
                  <OwnerInvoices
                    key={`invoices:${selected.id}`}
                    token={ownerSession.accessToken}
                    organizationId={selected.id}
                  />
                </>
              )}
              {!selected && <p>ยังไม่มีองค์กรในบัญชีนี้</p>}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

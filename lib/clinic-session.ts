export type ClinicSessionProfile = {
  name: string;
  clinicCode: string;
  roles?: string[];
};

export type ClinicLoginResult = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    clinicId: string;
    roles: string[];
  };
};

export function hasOwnerRole(profile: ClinicSessionProfile | null | undefined) {
  return profile?.roles?.includes("OWNER") ?? false;
}

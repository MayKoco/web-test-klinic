import { apiRequest } from "@/lib/api";

export async function readOwnerDirectoryPages<T>(path: string, token: string) {
  const separator = path.includes("?") ? "&" : "?";
  const read = (page: number) =>
    apiRequest<T[]>(`${path}${separator}limit=100&page=${page}`, { token });
  const first = await read(1);
  const rows = [...first.data];
  const pages = first.meta?.totalPages ?? 1;
  for (let page = 2; page <= pages; page += 4) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(4, pages - page + 1) }, (_, offset) =>
        read(page + offset),
      ),
    );
    for (const result of batch) rows.push(...result.data);
  }
  return rows;
}

import type { AccountStatus, Doctor, PalliativeAccount, PatientResponse } from "./data";
import { requireSession } from "./session";
import { boundedText, contactPhone, email, passwordPolicy, positiveInteger, validateDownload } from "./security";
import { apiRequest, apiRequestBlob, unwrapList } from "./apiClient";


export interface CreateHospitalInput {
  hospitalCode: string;
  institutionName: string;
  name: string;
  contactPhone: string;
  loginId: string;
  initialPassword: string;
}

export interface CreateDoctorInput {
  name: string;
  department: string;
  email: string;
}

export interface UpdateDoctorInput {
  name?: string | null;
  department?: string | null;
  email?: string | null;
  isActive?: boolean | null;
}

export interface CodeSummary {
  allocatedCodeCount: number;
  generatedCodeCount: number;
  redeemedCodeCount: number;
  remainingCodeCount: number;
}

export interface InstitutionCodeStatus extends CodeSummary {
  hospitalId: number;
  hospitalName: string;
  staffId: number;
  staffName: string;
  updatedAt: string;
}

export interface CodeStatusResult {
  total: CodeSummary;
  institutions: InstitutionCodeStatus[];
}

export type ResultCategory = "ALL" | "COMPLETED" | "UNUSED";

export interface ResultBoardStats {
  totalIssuedCount: number;
  responseCompletedCount: number;
  unusedCount: number;
}

export interface ResultBoardItem {
  // Unique number associated with patientName, not the result row ID.
  codeId: number | null;
  pin: string;
  userId: number | null;
  providerId: number | null;
  providerName: string | null;
  patientName: string | null;
  registrationNumber: string | null;
  submittedAt: string | null;
  state: "COMPLETED" | "UNUSED";
  recordId: number | null;
  resultAvailable: boolean;
}

export interface ResultBoardResponse {
  total: number;
  page: number;
  pageSize: number;
  stats: ResultBoardStats;
  items: ResultBoardItem[];
}

export interface StaffListParams {
  hospitalId?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface StaffListResult {
  total: number;
  page: number;
  pageSize: number;
  items: PalliativeAccount[];
}

interface StaffAccountResponse {
  id: number;
  role: "ADMIN" | "STAFF";
  hospitalId: number | null;
  hospitalCode: string | null;
  hospitalName: string | null;
  name: string;
  contactPhone: string | null;
  loginId: string;
  isActive: boolean;
  mustChangePassword: boolean;
  allocatedCodeCount: number;
  generatedCodeCount: number;
  remainingCodeCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StaffListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: StaffAccountResponse[];
}

function toPalliativeAccount(item: StaffAccountResponse): PalliativeAccount {
  return {
    id: item.id,
    org: item.hospitalName ?? "—",
    manager: item.name,
    contact: item.contactPhone ?? "—",
    loginId: item.loginId,
    registeredAt: item.createdAt,
    status: item.isActive ? "active" : "inactive",
    hospitalId: item.hospitalId,
    hospitalCode: item.hospitalCode,
    mustChangePassword: item.mustChangePassword,
    allocatedCodeCount: item.allocatedCodeCount,
    generatedCodeCount: item.generatedCodeCount,
    remainingCodeCount: item.remainingCodeCount,
    lastLoginAt: item.lastLoginAt,
    updatedAt: item.updatedAt,
  };
}

export interface UpdateStaffInput {
  hospitalCode?: string | null;
  institutionName?: string | null;
  name?: string | null;
  isActive?: boolean | null;
  contactPhone?: string | null;
  loginId?: string | null;
  initialPassword?: string | null;
}

export async function listHospitals({ hospitalId, search, page = 1, pageSize = 20 }: StaffListParams = {}): Promise<StaffListResult> {
  requireSession("ADMIN"); positiveInteger(page, 100000); positiveInteger(pageSize, 100); if (hospitalId !== undefined) positiveInteger(hospitalId); if (search?.trim()) boundedText(search, 60);


  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (hospitalId !== undefined) params.set("hospital_id", String(hospitalId));
  if (search?.trim()) params.set("search", search.trim());
  const payload = await apiRequest<StaffListResponse>(`/admin/staff?${params.toString()}`);

  return {
    total: payload.total,
    page: payload.page,
    pageSize: payload.pageSize,
    items: payload.items.map(toPalliativeAccount),
  };
}

export async function createHospital(input: CreateHospitalInput) {
  requireSession("ADMIN");
  const body = validateHospitalInput(input);

  const response = await apiRequest<StaffAccountResponse>("/admin/staff", { method: "POST", body });
  return toPalliativeAccount(response);
}

export async function updateStaffAccount(id: string | number, input: UpdateStaffInput): Promise<PalliativeAccount> {
  requireSession("ADMIN"); positiveInteger(id);
  const body = validateHospitalInput(input);

  const response = await apiRequest<StaffAccountResponse>(`/admin/staff/${encodeURIComponent(id)}`, { method: "PATCH", body });
  return toPalliativeAccount(response);
}

export async function setHospitalStatus(id: string | number, status: AccountStatus) {
  return updateStaffAccount(id, { isActive: status === "active" });
}

export async function deleteHospital(id: string | number) {
  requireSession("ADMIN"); positiveInteger(id);

  await apiRequest<{ message: string }>(`/admin/staff/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function listCodeStatus(): Promise<CodeStatusResult> {
  requireSession("ADMIN");

  return apiRequest<CodeStatusResult>("/admin/codes");
}

export async function grantStaffQuota(staffId: number, count: number): Promise<PalliativeAccount> {
  requireSession("ADMIN"); positiveInteger(staffId); positiveInteger(count, 100000);

  const response = await apiRequest<StaffAccountResponse>(`/admin/staff/${encodeURIComponent(staffId)}/quota`, {
    method: "POST",
    body: { count },
  });
  return toPalliativeAccount(response);
}

export interface ProviderListParams {
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProviderListResult {
  total: number;
  page: number;
  pageSize: number;
  items: Doctor[];
}

interface ProviderResponse {
  id: number;
  hospitalId: number;
  department: string | null;
  name: string;
  email: string;
  issuedCodeCount: number;
  usedCodeCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderDetail extends ProviderResponse {}

interface ProviderListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: ProviderResponse[];
}

function toDoctor(item: ProviderResponse): Doctor {
  return {
    id: String(item.id),
    name: item.name,
    department: item.department ?? "—",
    email: item.email,
    issued: item.issuedCodeCount,
    used: item.usedCodeCount,
    status: item.isActive ? "active" : "inactive",
  };
}

export async function listDoctors({ isActive, page = 1, pageSize = 20 }: ProviderListParams = {}): Promise<ProviderListResult> {
  requireSession("STAFF"); positiveInteger(page, 100000); positiveInteger(pageSize, 100);

  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (isActive !== undefined) params.set("is_active", String(isActive));
  const payload = await apiRequest<ProviderListResponse>(`/staff/providers?${params.toString()}`);
  return {
    total: payload.total,
    page: payload.page,
    pageSize: payload.pageSize,
    items: payload.items.map(toDoctor),
  };
}

export async function createDoctor(input: CreateDoctorInput) {
  requireSession("STAFF"); validateDoctorInput(input);

  const response = await apiRequest<ProviderResponse>("/staff/providers", { method: "POST", body: input });
  return toDoctor(response);
}

export async function updateDoctor(id: string | number, input: UpdateDoctorInput): Promise<Doctor> {
  requireSession("STAFF"); positiveInteger(id); validateDoctorInput(input);

  const response = await apiRequest<ProviderResponse>(`/staff/providers/${encodeURIComponent(id)}`, { method: "PATCH", body: input });
  return toDoctor(response);
}

export async function getDoctorDetail(id: string | number): Promise<ProviderDetail> {
  requireSession("STAFF"); positiveInteger(id);

  return apiRequest<ProviderDetail>(`/staff/providers/${encodeURIComponent(id)}`);
}

export interface CodeBatchResult {
  batchId: number;
  hospitalId: number;
  providerId: number;
  count: number;
  codes: string[];
  remainingCodeCount: number;
  excelUrl: string;
  createdAt: string;
}

export async function issueCodes(providerId: number, count: number): Promise<CodeBatchResult> {
  requireSession("STAFF"); positiveInteger(providerId); positiveInteger(count, 100);

  return apiRequest<CodeBatchResult>("/staff/code_batches", { method: "POST", body: { count, providerId } });
}

export async function downloadUnusedCodes(providerId: number): Promise<Blob> {
  requireSession("STAFF"); positiveInteger(providerId);

  return validateDownload(await apiRequestBlob(`/staff/providers/${encodeURIComponent(providerId)}/codes.xlsx`), "xlsx");
}

export async function downloadSignupQr(): Promise<Blob> {
  requireSession("STAFF");

  return validateDownload(await apiRequestBlob("/auth/qr", { auth: false }), "png");
}

export async function listResponses() {
  requireSession("STAFF");

  const payload = await apiRequest<PatientResponse[] | { items?: PatientResponse[]; content?: PatientResponse[]; data?: PatientResponse[] }>("/manage/responses");
  return unwrapList(payload);
}

export async function getResponseDetail(id: string) {
  requireSession("STAFF"); positiveInteger(id);

  return apiRequest<unknown>(`/manage/responses/${encodeURIComponent(id)}`);
}

export async function listStaffResults({ category = "ALL", page = 1, pageSize = 20 }: { category?: ResultCategory; page?: number; pageSize?: number } = {}): Promise<ResultBoardResponse> {
  requireSession("STAFF"); positiveInteger(page, 100000); positiveInteger(pageSize, 100); if (!["ALL", "COMPLETED", "UNUSED"].includes(category)) throw new Error("조회 구분이 올바르지 않습니다.");

  const params = new URLSearchParams({ category, page: String(page), page_size: String(pageSize) });
  return apiRequest<ResultBoardResponse>(`/staff/results?${params.toString()}`);
}

export async function getPdaResultPdf(recordId: number): Promise<Blob> {
  requireSession("STAFF"); positiveInteger(recordId);
  return validateDownload(await apiRequestBlob(`/staff/results/${encodeURIComponent(recordId)}/pdf`, {
    headers: { Accept: "application/pdf" },
  }), "pdf");
}

function validateHospitalInput(input: UpdateStaffInput) {
  const body = { ...input };
  for (const key of ["institutionName", "name"] as const) if (input[key] !== undefined) body[key] = boundedText(input[key]);
  if (input.hospitalCode !== undefined && !/^[0-9]{2}$/.test(input.hospitalCode ?? "")) throw new Error("기관 코드는 숫자 2자리입니다.");
  if (input.contactPhone !== undefined) body.contactPhone = contactPhone(input.contactPhone ?? "");
  if (input.loginId !== undefined) body.loginId = email(input.loginId ?? "");
  if (input.initialPassword !== undefined) passwordPolicy(input.initialPassword ?? "");
  return body;
}
function validateDoctorInput(input: UpdateDoctorInput) {
  for (const key of ["name", "department"] as const) if (input[key] !== undefined && input[key] !== null) boundedText(input[key]);
  if (input.email !== undefined) email(input.email ?? "");
}

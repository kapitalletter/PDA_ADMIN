export type AccountStatus = "active" | "inactive"

export interface PalliativeAccount {
  id: string | number
  org: string
  manager: string
  contact: string
  loginId?: string
  registeredAt: string
  status: AccountStatus
  hospitalId?: number | null
  hospitalCode?: string | null
  mustChangePassword?: boolean
  allocatedCodeCount?: number
  generatedCodeCount?: number
  remainingCodeCount?: number
  lastLoginAt?: string | null
  updatedAt?: string
}


export interface OrgQuota {
  id: string
  org: string
  quota: number
  generated: number
  completed: number
  updatedAt: string
}


export interface Doctor {
  id: string
  name: string
  department: string
  email: string
  issued: number
  used: number
  status: AccountStatus
}


export interface PatientResponse {
  id: string
  pin: string
  doctor: string
  patientInitial: string
  submittedAt: string
  status: "completed" | "unused" | "pending"
}

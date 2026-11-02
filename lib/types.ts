// Shapes of the documents stored per school. Older records may lack newer fields, hence the optionals.

export type RecordId = number | string;

export interface BaseRecord {
  _id?: string;
  id: RecordId;
  schoolId?: string;
}

export interface Student extends BaseRecord {
  name: string;
  fatherName?: string;
  /** For fee reminders on WhatsApp; brothers and sisters share it, which links a family. */
  parentPhone?: string;
  admissionNumber?: string;
  classId?: string;
  monthlyFee?: number;
  discount?: number;
  /** Billed every month on top of the fee (transport, say); copied onto each new voucher. */
  monthlyCharges?: Charge[];
  annualCharges?: number;
  paidAnnualCharges?: number;
  /** 'Left' students are no longer billed; their history stays. Older records may say anything else. */
  status?: string;
  leftAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SchoolClass extends BaseRecord {
  name: string;
  section?: string;
  monthlyFee?: number;
  annualCharges?: number;
  createdAt?: string;
}

export interface FeeVoucher extends BaseRecord {
  studentId: RecordId;
  studentName?: string;
  fatherName?: string;
  admissionNumber?: string;
  className?: string;
  classId?: RecordId;
  month: string;
  year: string;
  /** What this month bills: the fee less the discount, plus the charges. */
  amount: number;
  baseAmount?: number;
  discount?: number;
  /** Charges on top of the fee (admission, exam, transport...), already included in `amount`. */
  charges?: Charge[];
  status: 'Paid' | 'Unpaid' | 'Partially Paid';
  issueDate?: string;
  /** Pay by this time to avoid the late fine. Vouchers from before due dates were tracked have none. */
  dueDate?: string;
  paymentDate?: string | null;
  totalReceived?: number;
  paidTuition?: number;
  paidAC?: number;
  /** Filled in by the API from the student's earlier unpaid vouchers. */
  previousArrears?: number;
  remainingAnnualCharges?: number;
  /** Late fine fixed on this voucher once a late payment was taken against it. */
  fineCharged?: number;
  fineWaived?: boolean;
  /** Older installs recorded annual-charge payments as their own vouchers. */
  isACOnly?: boolean;
  // Worked out by the API on every read:
  /** The late fine this voucher owes (charged, or pending because it is overdue). */
  lateFine?: number;
  /** Everything owed for this voucher right now: its own balance, arrears and annual charges. */
  balanceDue?: number;
  /** The earlier vouchers making up previousArrears, oldest first. */
  arrears?: ArrearsLine[];
  parentPhone?: string;
}

/** One line billed on top of the monthly fee. */
export interface Charge {
  label: string;
  amount: number;
}

export interface ArrearsLine {
  voucherId: RecordId;
  month: string;
  year: string;
  amount: number;
  /** Part of `amount` that is a late fine not yet charged (a payment may still waive it). */
  fine?: number;
}

export interface Expense extends BaseRecord {
  category?: string;
  amount: number;
  description?: string;
  date: string;
}

export interface StaffMember extends BaseRecord {
  name: string;
  designation?: string;
  salary: number;
  deductionPerOff: number;
  joinedDate?: string;
  status?: string;
}

export interface SalaryRecord extends BaseRecord {
  staffId: RecordId;
  staffName: string;
  month?: string;
  year?: string;
  amount: number;
  offs?: number;
  deduction?: number;
  paymentDate: string;
  /** Some older records carry this instead of paymentDate. */
  date?: string;
}

export interface AppUser extends BaseRecord {
  username: string;
  password: string;
  displayName: string;
  role: 'admin' | 'accountant';
  status: 'active' | 'blocked';
  createdAt?: string;
}

export interface SchoolConfig {
  adminUsername?: string;
  adminPassword?: string;
  schoolName?: string;
  superAdminPassword?: string;
  /** Days from issue until a voucher is due. */
  dueDays?: number;
  /** Charged once on a voucher paid after its due date; 0 means no fine. */
  lateFine?: number;
}

/** One cash receipt; its id is the receipt number. Reversed receipts stay on file, marked. */
export interface Payment extends BaseRecord {
  voucherId: RecordId;
  studentId?: RecordId;
  studentName?: string;
  className?: string;
  month?: string;
  year?: string;
  paidTuition: number;
  paidAC: number;
  amount: number;
  receivedAt: string;
  receivedBy: string;
  receivedByName?: string;
  /** Where the tuition went: older unpaid months first, then the voucher being paid, then later months. */
  allocations?: Allocation[];
  reversedAt?: string;
  reversedBy?: string;
}

export interface Allocation {
  voucherId: RecordId;
  month?: string;
  year?: string;
  amount: number;
  /** Late fine this payment fixed on the voucher (undone if the receipt is reversed). */
  fineCharged?: number;
  /** Late fine this payment waived. */
  fineWaived?: number;
  /**
   * Advance fee: the voucher was made by this payment, for a month not billed yet. Reversing the
   * receipt removes it again while that month is still to come.
   */
  created?: boolean;
}

/** A line in the principal's Activity Log. */
export interface AuditEntry {
  _id?: string;
  schoolId: string;
  at: string;
  username: string;
  displayName?: string;
  role: string;
  action: string;
  summary: string;
}

/** A student sharing a parent phone number with others: one family. */
export interface FamilyMember {
  studentId: RecordId;
  name: string;
  className: string;
  left: boolean;
  /** Everything owed today, due or not. */
  balance: number;
}

/** A row of the defaulter list. */
export interface Defaulter {
  studentId: RecordId;
  name: string;
  fatherName?: string;
  parentPhone?: string;
  admissionNumber?: string;
  classId?: string;
  className: string;
  left: boolean;
  /** Months with tuition still owing. */
  months: number;
  oldestUnpaid: string;
  tuition: number;
  fines: number;
  annualCharges: number;
  total: number;
  lastPayment: string | null;
}

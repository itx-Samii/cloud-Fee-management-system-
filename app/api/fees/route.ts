import { NextResponse } from 'next/server';
import { readData, writeData, generateId } from '@/lib/fileHandler';

// --- TypeScript Interfaces ---
interface FeeRecord {
  id: number;
  studentId: number;
  month: string;
  year: string;
  baseAmount: number;
  discount: number;
  amount: number;
  status: 'Paid' | 'Unpaid';
  issueDate: string;
  paymentDate: string | null;
  paidTuition?: number;
  paidAC?: number;
  totalReceived?: number;
  isACOnly?: boolean;
  note?: string;
}

interface Student {
  id: number;
  name: string;
  fatherName: string;
  admissionNumber?: string;
  classId: string;
  monthlyFee: number;
  discount: number;
  annualCharges: number;
  paidAnnualCharges: number;
  status: string;
}

interface ClassRecord {
  id: number;
  name: string;
  section?: string;
}

const FILE_NAME = 'fees.json';
const STUDENTS_FILE = 'students.json';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    const fees = await readData<FeeRecord>(FILE_NAME);
    const students = await readData<Student>(STUDENTS_FILE);
    const classes = await readData<ClassRecord>('classes.json').catch(() => []);
    
    let filtered = fees;
    if (month && year) {
      filtered = filtered.filter((f) => f.month === month && f.year === year);
    }

    const enriched = filtered.map((f) => {
      const student = students.find((s) => s.id === f.studentId);
      const studentClass = student?.classId ? classes.find((c) => c.id.toString() === student.classId.toString()) : null;
      const classDisplay = studentClass ? `${studentClass.name}${studentClass.section ? ` - ${studentClass.section}` : ''}` : student?.classId || 'N/A';
      return {
        ...f,
        studentName: student?.name || 'Unknown',
        fatherName: student?.fatherName || 'N/A',
        admissionNumber: student?.admissionNumber || 'N/A',
        rollNumber: (student as any)?.rollNumber || 'N/A',
        classId: student?.classId || 'N/A',
        className: classDisplay,
        totalAnnualCharges: student?.annualCharges || 0,
        paidAnnualCharges: student?.paidAnnualCharges || 0,
        remainingAnnualCharges: (student?.annualCharges || 0) - (student?.paidAnnualCharges || 0)
      };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch fees' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // CASE 1: Standalone AC Payment (from AC Ledger)
    if (body.isACOnly) {
      const { studentId, amount, paymentDate } = body;

      // Validate AC payment
      if (!studentId) return NextResponse.json({ error: 'Student ID is required' }, { status: 400 });
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
      }

      const students = await readData<Student>(STUDENTS_FILE);
      const studentIndex = students.findIndex((s) => s.id === studentId);
      
      if (studentIndex === -1) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      
      // Update student balance
      students[studentIndex].paidAnnualCharges = (students[studentIndex].paidAnnualCharges || 0) + parseFloat(amount);
      await writeData(STUDENTS_FILE, students);

      // Create transaction record
      const allFees = await readData<FeeRecord>(FILE_NAME);
      const nextId = await generateId(FILE_NAME);
      const newRecord: FeeRecord = {
        id: nextId,
        studentId,
        month: 'Annual Charges',
        year: new Date(paymentDate || Date.now()).getFullYear().toString(),
        baseAmount: 0,
        discount: 0,
        amount: 0, 
        paidTuition: 0,
        paidAC: parseFloat(amount),
        totalReceived: parseFloat(amount),
        status: 'Paid',
        issueDate: new Date().toISOString(),
        paymentDate: paymentDate || new Date().toISOString(),
        note: 'Direct AC Payment'
      };
      
      allFees.push(newRecord);
      await writeData(FILE_NAME, allFees);
      return NextResponse.json(newRecord);
    }

    // CASE 2: Batch Monthly Generation
    const { month, year, classId } = body;
    if (!month || !year) return NextResponse.json({ error: 'Month and year required' }, { status: 400 });

    // Validate month is a real month name
    const validMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    if (!validMonths.includes(month)) {
      return NextResponse.json({ error: 'Invalid month name' }, { status: 400 });
    }

    const allStudents = await readData<Student>(STUDENTS_FILE);
    const allFees = await readData<FeeRecord>(FILE_NAME);
    let nextId = await generateId(FILE_NAME);
    
    let generatedCount = 0;

    for (const student of allStudents) {
      if (student.status !== 'Active') continue;
      if (classId && classId !== 'all' && student.classId !== classId) continue;

      // Check if fee already exists
      const exists = allFees.find((f) => f.studentId === student.id && f.month === month && f.year === year);
      if (!exists) {
        const netAmount = (student.monthlyFee || 0) - (student.discount || 0);

        allFees.push({
          id: nextId++,
          studentId: student.id,
          month,
          year,
          baseAmount: student.monthlyFee || 0,
          discount: student.discount || 0,
          amount: netAmount > 0 ? netAmount : 0,
          status: 'Unpaid',
          issueDate: new Date().toISOString(),
          paymentDate: null
        });
        generatedCount++;
      }
    }

    if (generatedCount > 0) {
      await writeData(FILE_NAME, allFees);
    }
    
    return NextResponse.json({ success: true, count: generatedCount });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, paidTuition, paidAC } = await request.json();
    if (!id) return NextResponse.json({ error: 'Voucher ID missing' }, { status: 400 });

    // Validate payment amounts
    if (paidTuition !== undefined && (isNaN(Number(paidTuition)) || Number(paidTuition) < 0)) {
      return NextResponse.json({ error: 'Tuition amount must be a non-negative number' }, { status: 400 });
    }
    if (paidAC !== undefined && (isNaN(Number(paidAC)) || Number(paidAC) < 0)) {
      return NextResponse.json({ error: 'AC amount must be a non-negative number' }, { status: 400 });
    }

    const allFees = await readData<FeeRecord>(FILE_NAME);
    const feeIndex = allFees.findIndex((f) => f.id === id);
    
    if (feeIndex === -1) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 });
    }

    const feeRecord = allFees[feeIndex];

    // Update Student AC Balance
    const students = await readData<Student>(STUDENTS_FILE);
    const studentIndex = students.findIndex((s) => s.id === feeRecord.studentId);
    
    if (studentIndex !== -1) {
      const acAmount = parseFloat(paidAC || '0');
      students[studentIndex].paidAnnualCharges = (students[studentIndex].paidAnnualCharges || 0) + acAmount;
      await writeData(STUDENTS_FILE, students);
    }

    allFees[feeIndex].status = 'Paid';
    allFees[feeIndex].paymentDate = new Date().toISOString();
    allFees[feeIndex].paidTuition = parseFloat(paidTuition || feeRecord.amount as any);
    allFees[feeIndex].paidAC = parseFloat(paidAC || '0');
    allFees[feeIndex].totalReceived = (allFees[feeIndex].paidTuition || 0) + (allFees[feeIndex].paidAC || 0);

    await writeData(FILE_NAME, allFees);
    
    return NextResponse.json(allFees[feeIndex]);
  } catch (err) {
    return NextResponse.json({ error: 'System Error processing payment' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const allFees = await readData<FeeRecord>(FILE_NAME);
    const feeIndex = allFees.findIndex((f) => f.id.toString() === id.toString());

    if (feeIndex === -1) {
      return NextResponse.json({ error: 'Fee record not found' }, { status: 404 });
    }

    const feeToRemove = allFees[feeIndex];

    // REVERSAL LOGIC: If the fee was "Paid", we must undo the student's paid AC balance
    if (feeToRemove.status === 'Paid' && (feeToRemove.paidAC || 0) > 0) {
      const students = await readData<Student>(STUDENTS_FILE);
      const studentIndex = students.findIndex((s) => s.id === feeToRemove.studentId);
      if (studentIndex !== -1) {
        students[studentIndex].paidAnnualCharges = Math.max(0, (students[studentIndex].paidAnnualCharges || 0) - (feeToRemove.paidAC || 0));
        await writeData(STUDENTS_FILE, students);
      }
    }

    // Now remove the fee record
    const updatedFees = allFees.filter((f) => f.id.toString() !== id.toString());
    await writeData(FILE_NAME, updatedFees);

    return NextResponse.json({ success: true, message: 'Fee record reversed/deleted successfully' });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to reverse fee' }, { status: 500 });
  }
}


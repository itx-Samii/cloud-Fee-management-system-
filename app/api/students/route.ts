import { NextResponse } from 'next/server';
import { readData, writeData, generateId } from '@/lib/fileHandler';

// --- TypeScript Interfaces ---
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
  rollNumber?: string;
  createdAt: string;
  updatedAt?: string;
}

interface ClassRecord {
  id: number;
  name: string;
  section?: string;
}

const FILE_NAME = 'students.json';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.toLowerCase() || '';
    const classIdFilter = searchParams.get('classId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const allStudents = await readData<Student>(FILE_NAME);
    const allClasses = await readData<ClassRecord>('classes.json').catch(() => []);
    
    let filtered = allStudents;
    
    // Server side filtering by class
    if (classIdFilter) {
      filtered = filtered.filter((s) => s.classId?.toString() === classIdFilter);
    }

    // Server side search filtering
    filtered = search ? 
      filtered.filter((s) => 
        s.name.toLowerCase().includes(search) || 
        s.fatherName?.toLowerCase().includes(search) ||
        s.rollNumber?.toLowerCase().includes(search)
      ) : filtered;

    // Server side pagination
    const total = filtered.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginated = filtered.slice(start, end).map((s) => {
      // If classId is a database integer, find the class
      const dbClass = allClasses.find((c) => c.id.toString() === s.classId?.toString());
      return {
        ...s,
        className: dbClass ? `${dbClass.name}${dbClass.section ? ` - ${dbClass.section}` : ''}` : s.classId
      };
    });

    return NextResponse.json({
      data: paginated,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Input validation
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'Student name is required' }, { status: 400 });
    }
    if (!body.fatherName || typeof body.fatherName !== 'string' || body.fatherName.trim().length === 0) {
      return NextResponse.json({ error: "Father's name is required" }, { status: 400 });
    }
    if (!body.classId) {
      return NextResponse.json({ error: 'Class assignment is required' }, { status: 400 });
    }
    if (body.monthlyFee !== undefined && (isNaN(Number(body.monthlyFee)) || Number(body.monthlyFee) < 0)) {
      return NextResponse.json({ error: 'Monthly fee must be a non-negative number' }, { status: 400 });
    }

    const allStudents = await readData<Student>(FILE_NAME);
    const id = await generateId(FILE_NAME);
    
    const newStudent: Student = {
      id,
      name: body.name.trim(),
      fatherName: body.fatherName.trim(),
      admissionNumber: body.admissionNumber?.trim() || undefined,
      classId: body.classId,
      monthlyFee: parseFloat(body.monthlyFee) || 0,
      discount: parseFloat(body.discount) || 0,
      annualCharges: parseFloat(body.annualCharges) || 0,
      paidAnnualCharges: 0,
      status: body.status || 'Active',
      rollNumber: body.rollNumber || undefined,
      createdAt: new Date().toISOString()
    };

    allStudents.push(newStudent);
    
    await writeData(FILE_NAME, allStudents);
    return NextResponse.json(newStudent);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to add student' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    // Validate editable fields if provided
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
      return NextResponse.json({ error: 'Student name cannot be empty' }, { status: 400 });
    }
    if (body.monthlyFee !== undefined && (isNaN(Number(body.monthlyFee)) || Number(body.monthlyFee) < 0)) {
      return NextResponse.json({ error: 'Monthly fee must be a non-negative number' }, { status: 400 });
    }
    if (body.discount !== undefined && (isNaN(Number(body.discount)) || Number(body.discount) < 0)) {
      return NextResponse.json({ error: 'Discount must be a non-negative number' }, { status: 400 });
    }

    let students = await readData<Student>(FILE_NAME);
    const index = students.findIndex((s) => s.id.toString() === body.id.toString());
    
    if (index === -1) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Capture old data
    const existingStudent = students[index];
    
    const updatedStudent: Student = {
      ...existingStudent,
      name: body.name !== undefined ? body.name.trim() : existingStudent.name,
      fatherName: body.fatherName !== undefined ? body.fatherName.trim() : existingStudent.fatherName,
      admissionNumber: body.admissionNumber !== undefined ? (body.admissionNumber?.trim() || undefined) : existingStudent.admissionNumber,
      classId: body.classId !== undefined ? body.classId : existingStudent.classId,
      monthlyFee: body.monthlyFee !== undefined ? parseFloat(body.monthlyFee) : existingStudent.monthlyFee,
      discount: body.discount !== undefined ? parseFloat(body.discount) : existingStudent.discount,
      annualCharges: body.annualCharges !== undefined ? parseFloat(body.annualCharges) : existingStudent.annualCharges,
      status: (body.status === 'Active' || body.status === 'Inactive') ? body.status : existingStudent.status,
      updatedAt: new Date().toISOString()
    };

    students[index] = updatedStudent;
    await writeData(FILE_NAME, students);

    // AUTO-SYNC: If fee or discount changed, update active unpaid vouchers
    if (body.monthlyFee !== undefined || body.discount !== undefined || body.annualCharges !== undefined) {
      const fees = await readData<any>('fees.json');
      let feeChanged = false;
      
      const updatedFees = fees.map((f: any) => {
        if (f.studentId.toString() === body.id.toString() && f.status === 'Unpaid') {
          feeChanged = true;
          // Recalculate net amount
          const base = body.monthlyFee ?? f.baseAmount;
          const disc = body.discount ?? f.discount;
          return {
            ...f,
            baseAmount: base,
            discount: disc,
            amount: base - disc,
            remainingAnnualCharges: body.annualCharges !== undefined ? (body.annualCharges - (f.paidAC || 0)) : f.remainingAnnualCharges
          };
        }
        return f;
      });

      if (feeChanged) {
        await writeData('fees.json', updatedFees);
      }
    }
    
    return NextResponse.json(students[index]);
  } catch (err) {
    console.error("PUT Update Error:", err);
    return NextResponse.json({ error: 'Failed to update student' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    let students = await readData<Student>(FILE_NAME);
    const initialLength = students.length;
    students = students.filter((s) => s.id.toString() !== id);
    
    if (students.length === initialLength) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    await writeData(FILE_NAME, students);

    // CASCADING DELETE: Remove all fees associated with this student
    try {
      const fees = await readData<any>('fees.json');
      const updatedFees = fees.filter((f: any) => f.studentId.toString() !== id.toString());
      if (fees.length !== updatedFees.length) {
        await writeData('fees.json', updatedFees);
      }
    } catch (e) {
      console.error("Cleanup fees failed", e);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete student' }, { status: 500 });
  }
}

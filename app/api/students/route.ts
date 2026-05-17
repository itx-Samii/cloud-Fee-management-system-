import { NextResponse } from 'next/server';
import { readData, writeData, generateId, getTenantId } from '@/lib/dbHandler';
import { getDatabase } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const schoolId = await getTenantId();
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search')?.toLowerCase() || '';
    const classId = searchParams.get('classId') || 'all';

    const allStudents = await readData<any>('students.json', schoolId);
    const allClasses = await readData<any>('classes.json', schoolId);

    let filtered = allStudents.filter((s: any) => {
      const nameMatch = (s.name?.toLowerCase() || "").includes(search) || 
                       (s.fatherName?.toLowerCase() || "").includes(search) ||
                       (s.admissionNumber?.toLowerCase() || "").includes(search);
      if (classId && classId !== 'all') {
        return nameMatch && s.classId?.toString() === classId.toString();
      }
      return nameMatch;
    });

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedStudents = filtered.slice(startIndex, endIndex);

    const enriched = paginatedStudents.map((student: any) => {
      const studentClass = allClasses.find((c: any) => c.id.toString() === student.classId?.toString());
      return { ...student, className: studentClass ? studentClass.name : 'Unassigned' };
    });

    const totalPages = Math.ceil(total / limit) || 1;
    return NextResponse.json({ total, page, limit, totalPages, students: enriched, data: enriched });
  } catch (err: any) {
    console.error(`Local JSON GET Students Error for ${schoolId}:`, err);
    return NextResponse.json({ error: 'Failed to fetch students', details: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const schoolId = await getTenantId();
  try {
    const body = await request.json();
    
    const students = await readData<any>('students.json', schoolId);

    const db = await getDatabase();
    const license = await db.collection('licenses').findOne({ $or: [{ schoolId }, { id: schoolId }] });
    const maxStudents = license?.maxStudents || 1000;

    if (students.length >= maxStudents) {
      return NextResponse.json({ error: `Student capacity reached (${maxStudents} max limit). Please contact Super Admin to upgrade your SaaS license.` }, { status: 403 });
    }
    
    const newId = await generateId('students.json', schoolId);
    
    const newStudent = { 
      ...body, 
      id: newId,
      schoolId,
      monthlyFee: parseFloat(body.monthlyFee || '0'),
      annualCharges: parseFloat(body.annualCharges || '0'),
      discount: parseFloat(body.discount || '0'),
      createdAt: new Date().toISOString(),
      paidAnnualCharges: 0 
    };

    students.push(newStudent);
    await writeData('students.json', students, schoolId);

    return NextResponse.json(newStudent);
  } catch (err: any) {
    console.error(`Local JSON POST Student Error for ${schoolId}:`, err);
    return NextResponse.json({ error: 'Failed to create student', details: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const schoolId = await getTenantId();
  try {
    const body = await request.json();
    const { id, ...updateData } = body;
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const students = await readData<any>('students.json', schoolId);
    const sIndex = students.findIndex((s: any) => s.id.toString() === id.toString());
    
    if (sIndex === -1) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const cleanUpdateData = {
      name: updateData.name,
      fatherName: updateData.fatherName,
      classId: updateData.classId !== undefined ? updateData.classId?.toString() : undefined,
      monthlyFee: updateData.monthlyFee !== undefined ? parseFloat(updateData.monthlyFee) : undefined,
      discount: updateData.discount !== undefined ? parseFloat(updateData.discount) : undefined,
      admissionNumber: updateData.admissionNumber,
      annualCharges: updateData.annualCharges !== undefined ? parseFloat(updateData.annualCharges) : undefined,
      paidAnnualCharges: updateData.paidAnnualCharges !== undefined ? parseFloat(updateData.paidAnnualCharges) : undefined,
      updatedAt: new Date().toISOString()
    };

    Object.keys(cleanUpdateData).forEach(key => {
      if ((cleanUpdateData as any)[key] === undefined) {
        delete (cleanUpdateData as any)[key];
      }
    });
    
    students[sIndex] = { ...students[sIndex], ...cleanUpdateData };
    await writeData('students.json', students, schoolId);

    const syncFields = ['monthlyFee', 'discount', 'annualCharges', 'name', 'fatherName', 'admissionNumber', 'classId'];
    const changed = syncFields.some(f => updateData[f] !== undefined);
    
    if (changed) {
      const fees = await readData<any>('fees.json', schoolId);
      const classes = await readData<any>('classes.json', schoolId);
      let feesModified = false;

      for (let i = 0; i < fees.length; i++) {
        if (fees[i].studentId?.toString() === id.toString() && fees[i].status !== 'Paid') {
          if (updateData.monthlyFee !== undefined || updateData.discount !== undefined) {
            fees[i].baseAmount = updateData.monthlyFee ?? fees[i].baseAmount;
            fees[i].discount = updateData.discount ?? fees[i].discount;
            fees[i].amount = Math.max(0, fees[i].baseAmount - fees[i].discount);
          }
          if (updateData.name !== undefined) fees[i].studentName = updateData.name;
          if (updateData.fatherName !== undefined) fees[i].fatherName = updateData.fatherName;
          if (updateData.admissionNumber !== undefined) fees[i].admissionNumber = updateData.admissionNumber;
          if (updateData.classId !== undefined) {
            const cObj = classes.find((c: any) => c.id?.toString() === updateData.classId?.toString());
            fees[i].classId = updateData.classId?.toString();
            if (cObj) {
              fees[i].className = `${cObj.name}${cObj.section ? ' - ' + cObj.section : ''}`;
            }
          }
          
          feesModified = true;
        }
      }

      if (feesModified) {
        await writeData('fees.json', fees, schoolId);
      }
    }

    return NextResponse.json({ id, ...cleanUpdateData });
  } catch (err: any) {
    console.error(`Local JSON PUT Student Error for ${schoolId}:`, err);
    return NextResponse.json({ error: 'Failed to update student', details: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const schoolId = await getTenantId();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    let students = await readData<any>('students.json', schoolId);
    students = students.filter((s: any) => s.id.toString() !== id.toString());
    await writeData('students.json', students, schoolId);

    let fees = await readData<any>('fees.json', schoolId);
    fees = fees.filter((f: any) => f.studentId?.toString() !== id.toString());
    await writeData('fees.json', fees, schoolId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`Local JSON DELETE Student Error for ${schoolId}:`, err);
    return NextResponse.json({ error: 'Failed to delete student', details: err.message }, { status: 500 });
  }
}

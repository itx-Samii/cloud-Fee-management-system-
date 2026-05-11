import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search')?.toLowerCase() || '';
    const classId = searchParams.get('classId') || 'all';

    console.log("Fetching students using Admin SDK...");
    const studentsSnap = await adminDb.collection('students').get();
    console.log(`Admin SDK: Found ${studentsSnap.size} students`);

    let allStudents: any[] = [];
    studentsSnap.forEach(doc => allStudents.push({ ...doc.data() }));

    const classesSnap = await adminDb.collection('classes').get();
    let allClasses: any[] = [];
    classesSnap.forEach(doc => allClasses.push({ ...doc.data() }));

    let filtered = allStudents.filter((s) => {
      const nameMatch = (s.name?.toLowerCase() || "").includes(search) || 
                       (s.fatherName?.toLowerCase() || "").includes(search) ||
                       (s.admissionNumber?.toLowerCase() || "").includes(search);
      const classMatch = classId === 'all' || s.classId?.toString() === classId.toString();
      return nameMatch && classMatch;
    });

    const total = filtered.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    
    const paginated = filtered.slice(start, end).map((s) => {
      const dbClass = allClasses.find((c) => c.id.toString() === s.classId?.toString());
      return {
        ...s,
        className: dbClass ? `${dbClass.name}${dbClass.section ? ` - ${dbClass.section}` : ''}` : s.classId || 'N/A'
      };
    });

    return NextResponse.json({
      students: paginated,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err: any) {
    console.error("Firebase Admin GET Students Error:", err);
    return NextResponse.json({ error: 'Failed to fetch students', details: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Creating student using Admin SDK:", body.name);
    
    const studentsSnap = await adminDb.collection('students').get();
    let maxId = 0;
    studentsSnap.forEach(doc => {
      const id = parseInt(doc.id);
      if (id > maxId) maxId = id;
    });
    
    const newId = maxId + 1;
    const newStudent = { 
      ...body, 
      id: newId,
      createdAt: new Date().toISOString(),
      paidAnnualCharges: 0 
    };

    await adminDb.collection('students').doc(newId.toString()).set(newStudent);
    return NextResponse.json(newStudent);
  } catch (err: any) {
    console.error("Firebase Admin POST Student Error:", err);
    return NextResponse.json({ error: 'Failed to create student', details: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    console.log(`Updating student ID ${id} using Admin SDK`);
    const studentRef = adminDb.collection('students').doc(id.toString());
    const studentSnap = await studentRef.get();
    
    if (!studentSnap.exists) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Prevent tracking data metadata from polluting student document
    const cleanUpdateData = {
      name: updateData.name,
      fatherName: updateData.fatherName,
      monthlyFee: updateData.monthlyFee,
      discount: updateData.discount,
      admissionNumber: updateData.admissionNumber,
      annualCharges: updateData.annualCharges,
      updatedAt: new Date().toISOString()
    };

    // Remove undefined fields
    Object.keys(cleanUpdateData).forEach(key => {
      if ((cleanUpdateData as any)[key] === undefined) {
        delete (cleanUpdateData as any)[key];
      }
    });
    
    await studentRef.update(cleanUpdateData);

    // Sync with fees if fee profile or personal info changed
    const syncFields = ['monthlyFee', 'discount', 'annualCharges', 'name', 'fatherName', 'admissionNumber'];
    const changed = syncFields.some(f => updateData[f] !== undefined);
    
    if (changed) {
      console.log(`Student profile changed, syncing unpaid vouchers...`);
      const feesSnap = await adminDb.collection('fees').where('studentId', '==', parseInt(id)).get();
      
      const batch = adminDb.batch();
      feesSnap.forEach(fDoc => {
        if (fDoc.data().status !== 'Paid') {
          const updates: any = {};
          
          if (updateData.monthlyFee !== undefined || updateData.discount !== undefined) {
            updates.baseAmount = updateData.monthlyFee ?? fDoc.data().baseAmount;
            updates.discount = updateData.discount ?? fDoc.data().discount;
            updates.amount = Math.max(0, updates.baseAmount - updates.discount);
          }
          
          if (updateData.name !== undefined) updates.studentName = updateData.name;
          if (updateData.fatherName !== undefined) updates.fatherName = updateData.fatherName;
          if (updateData.admissionNumber !== undefined) updates.admissionNumber = updateData.admissionNumber;

          if (Object.keys(updates).length > 0) {
            batch.update(fDoc.ref, updates);
          }
        }
      });
      await batch.commit();
    }

    return NextResponse.json({ id, ...updatedData });
  } catch (err: any) {
    console.error("Firebase Admin PUT Student Error:", err);
    return NextResponse.json({ error: 'Failed to update student', details: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    console.log(`Deleting student ID ${id} using Admin SDK`);
    await adminDb.collection('students').doc(id).delete();

    // Cascade delete fees
    const feesSnap = await adminDb.collection('fees').where('studentId', '==', parseInt(id)).get();
    const batch = adminDb.batch();
    feesSnap.forEach(fDoc => {
      batch.delete(fDoc.ref);
    });
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Firebase Admin DELETE Student Error:", err);
    return NextResponse.json({ error: 'Failed to delete student', details: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const classId = searchParams.get('classId');
    const status = searchParams.get('status');
    const month = searchParams.get('month');
    const year = searchParams.get('year');
    const search = searchParams.get('search')?.toLowerCase();
    const limit = parseInt(searchParams.get('limit') || '100');

    console.log(`🔍 FEES_GET: Querying fees. Search: ${search}, Limit: ${limit}`);

    let feesCollection = adminDb.collection('fees');
    let query: any = feesCollection;

    if (studentId) query = query.where('studentId', '==', parseInt(studentId));
    
    // Careful with class filtering: sometimes it's ID, sometimes Name
    if (classId && classId !== 'all') {
        if (!isNaN(Number(classId))) {
            query = query.where('classId', '==', parseInt(classId));
        } else {
            query = query.where('className', '==', classId);
        }
    }
    
    if (status && status !== 'all') query = query.where('status', '==', status);
    if (month && month !== 'all') query = query.where('month', '==', month);
    if (year && year !== 'all') query = query.where('year', '==', year);

    // Apply limit for speed
    query = query.limit(limit || 500);

    const snapshot = await query.get();
    console.log(`✅ FEES_GET: Found ${snapshot.size} records.`);
    
    let fees = snapshot.docs.map(doc => ({ ...doc.data() }));

    // Memory filter for search term (case-insensitive substring)
    if (search) {
        console.log(`🔍 FEES_SEARCH: Filtering ${fees.length} records for "${search}"`);
        fees = fees.filter(f => {
            try {
                const sName = (f.studentName || "").toString().toLowerCase();
                const fName = (f.fatherName || "").toString().toLowerCase();
                const admNo = (f.admissionNumber || "").toString().toLowerCase();
                const vId = (f.id || "").toString().toLowerCase();
                
                return sName.includes(search) || 
                       fName.includes(search) || 
                       admNo.includes(search) || 
                       vId === search;
            } catch (e) {
                return false;
            }
        });
        console.log(`🔍 FEES_SEARCH: Found ${fees.length} matches.`);
    }

    return NextResponse.json(fees);
  } catch (err: any) {
    console.error("❌ FEES_GET_ERROR:", err);
    // Return empty array instead of 500 to prevent frontend crash, but log it
    return NextResponse.json({ error: 'Database connection failed', details: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { studentIds, month, year, classId: filterClassId } = body;

    const idsToProcess = studentIds || (body.studentId ? [body.studentId] : null);

    if (!idsToProcess || !Array.isArray(idsToProcess)) {
      return NextResponse.json({ error: 'Invalid students list' }, { status: 400 });
    }

    console.log(`🚀 FEES_POST: Generating ${idsToProcess.length} vouchers for ${month} ${year}`);
    
    const studentsSnap = await adminDb.collection('students').get();
    const studentsMap = new Map();
    studentsSnap.forEach(doc => studentsMap.set(parseInt(doc.id), doc.data()));

    const allFeesSnap = await adminDb.collection('fees').get();
    let maxId = 0;
    allFeesSnap.forEach(doc => {
      const id = parseInt(doc.id);
      if (id > maxId) maxId = id;
    });

    const batch = adminDb.batch();
    const newVouchers: any[] = [];

    idsToProcess.forEach((sid, index) => {
      const student = studentsMap.get(parseInt(sid));
      if (!student) return;

      const newId = maxId + index + 1;
      const baseAmount = student.monthlyFee || 0;
      const discount = student.discount || 0;
      
      const voucher = {
        id: newId,
        studentId: parseInt(sid),
        studentName: student.name,
        fatherName: student.fatherName,
        admissionNumber: student.admissionNumber,
        className: student.className || `Class ${student.classId}`,
        classId: parseInt(student.classId),
        month: month || "Unknown",
        year: year || new Date().getFullYear().toString(),
        amount: Math.max(0, baseAmount - discount),
        baseAmount,
        discount,
        status: 'Unpaid',
        issueDate: new Date().toISOString(),
        paymentDate: null,
        totalReceived: 0,
        paidTuition: 0,
        paidAC: 0,
        previousArrears: 0,
        remainingAnnualCharges: (student.annualCharges || 0) - (student.paidAnnualCharges || 0)
      };

      batch.set(adminDb.collection('fees').doc(newId.toString()), voucher);
      newVouchers.push(voucher);
    });

    if (newVouchers.length === 0) {
      console.log("⚠️ FEES_POST: No vouchers to generate.");
      return NextResponse.json({ success: true, count: 0, message: "No new vouchers needed." });
    }

    await batch.commit();
    console.log(`✅ FEES_POST: Batch committed successfully for ${newVouchers.length} records.`);
    return NextResponse.json({ success: true, count: newVouchers.length });
  } catch (err: any) {
    console.error("❌ FEES_POST_ERROR:", err);
    return NextResponse.json({ error: 'Failed to generate vouchers', details: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, paidTuition, paidAC } = body;

    if (!id) return NextResponse.json({ error: 'Voucher ID required' }, { status: 400 });

    console.log(`💸 FEES_PUT: Recording payment for voucher ${id}`);

    const feeRef = adminDb.collection('fees').doc(id.toString());
    const feeSnap = await feeRef.get();

    if (!feeSnap.exists) return NextResponse.json({ error: 'Voucher not found' }, { status: 404 });

    const feeData = feeSnap.data()!;
    const totalReceived = (parseFloat(paidTuition) || 0) + (parseFloat(paidAC) || 0);
    const totalDue = (feeData.amount || 0) + (feeData.previousArrears || 0) + (feeData.remainingAnnualCharges || 0);

    let status = 'Unpaid';
    if (totalReceived >= totalDue) status = 'Paid';
    else if (totalReceived > 0) status = 'Partially Paid';

    const updateData = {
      status,
      paymentDate: new Date().toISOString(),
      paidTuition: parseFloat(paidTuition) || 0,
      paidAC: parseFloat(paidAC) || 0,
      totalReceived: totalReceived
    };

    await feeRef.update(updateData);

    if (parseFloat(paidAC) > 0 && feeData.studentId) {
      const studentRef = adminDb.collection('students').doc(feeData.studentId.toString());
      const studentSnap = await studentRef.get();
      if (studentSnap.exists) {
        const currentPaid = studentSnap.data()?.paidAnnualCharges || 0;
        await studentRef.update({
          paidAnnualCharges: currentPaid + parseFloat(paidAC)
        });
      }
    }

    console.log(`✅ FEES_PUT: Payment successful. Status: ${status}`);
    return NextResponse.json({ id, ...updateData });
  } catch (err: any) {
    console.error("❌ FEES_PUT_ERROR:", err);
    return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    console.log(`🗑️ FEES_DELETE: Reversing voucher ${id}`);
    await adminDb.collection('fees').doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("❌ FEES_DELETE_ERROR:", err);
    return NextResponse.json({ error: 'Failed to reverse fee' }, { status: 500 });
  }
}

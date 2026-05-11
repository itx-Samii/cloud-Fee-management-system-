import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log("Fetching classes using Admin SDK...");
    const classesSnap = await adminDb.collection('classes').get();
    
    const classes = classesSnap.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        studentCount: 0 // Removed expensive counting for speed
      };
    });

    return NextResponse.json(classes);
  } catch (err: any) {
    console.error("Admin SDK Classes GET Error:", err);
    return NextResponse.json({ error: 'Failed to fetch classes', details: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, section, monthlyFee, annualCharges } = body;

    const classesSnap = await adminDb.collection('classes').get();
    let maxId = 0;
    classesSnap.forEach(doc => {
      const id = parseInt(doc.id);
      if (id > maxId) maxId = id;
    });

    const newId = maxId + 1;
    const newClass = {
      id: newId,
      name,
      section,
      monthlyFee: parseFloat(monthlyFee),
      annualCharges: parseFloat(annualCharges || 0)
    };

    await adminDb.collection('classes').doc(newId.toString()).set(newClass);
    return NextResponse.json(newClass);
  } catch (err: any) {
    console.error("Admin SDK Classes POST Error:", err);
    return NextResponse.json({ error: 'Failed to create class', details: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    await adminDb.collection('classes').doc(id.toString()).update(updateData);
    return NextResponse.json({ id, ...updateData });
  } catch (err: any) {
    console.error("Admin SDK Classes PUT Error:", err);
    return NextResponse.json({ error: 'Failed to update class', details: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    await adminDb.collection('classes').doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Admin SDK Classes DELETE Error:", err);
    return NextResponse.json({ error: 'Failed to delete class', details: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await adminDb.collection('salaries').orderBy('paymentDate', 'desc').get();
    const salaries = snapshot.docs.map(doc => ({ ...doc.data() }));
    return NextResponse.json(salaries);
  } catch (err: any) {
    console.error("Admin SDK Salaries GET Error:", err);
    return NextResponse.json({ error: 'Failed to fetch salaries' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const snapshot = await adminDb.collection('salaries').get();
    let maxId = 0;
    snapshot.forEach(doc => {
      const id = parseInt(doc.id);
      if (id > maxId) maxId = id;
    });

    const newId = maxId + 1;
    const newSalary = { ...body, id: newId };
    
    await adminDb.collection('salaries').doc(newId.toString()).set(newSalary);
    return NextResponse.json(newSalary);
  } catch (err: any) {
    console.error("Admin SDK Salaries POST Error:", err);
    return NextResponse.json({ error: 'Failed to record salary' }, { status: 500 });
  }
}

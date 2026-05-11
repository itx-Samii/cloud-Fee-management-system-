import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await adminDb.collection('expenses').orderBy('date', 'desc').get();
    const expenses = snapshot.docs.map(doc => ({ ...doc.data() }));
    return NextResponse.json(expenses);
  } catch (err: any) {
    console.error("Admin SDK Expenses GET Error:", err);
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const snapshot = await adminDb.collection('expenses').get();
    let maxId = 0;
    snapshot.forEach(doc => {
      const id = parseInt(doc.id);
      if (id > maxId) maxId = id;
    });

    const newId = maxId + 1;
    const newExpense = { ...body, id: newId };
    
    await adminDb.collection('expenses').doc(newId.toString()).set(newExpense);
    return NextResponse.json(newExpense);
  } catch (err: any) {
    console.error("Admin SDK Expenses POST Error:", err);
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    await adminDb.collection('expenses').doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Admin SDK Expenses DELETE Error:", err);
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}

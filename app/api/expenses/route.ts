import { NextResponse } from 'next/server';
import { readData, writeData, generateId, getTenantId } from '@/lib/dbHandler';

export const dynamic = 'force-dynamic';

export async function GET() {
  const schoolId = await getTenantId();
  try {
    let expenses = await readData<any>('expenses.json', schoolId);
    if (!Array.isArray(expenses)) expenses = [];
    expenses = expenses.map((e: any) => ({
      ...e,
      date: e.date || new Date().toISOString()
    }));
    expenses.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    return NextResponse.json(expenses);
  } catch (err: any) {
    console.error(`Local JSON Expenses GET Error for ${schoolId}:`, err);
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  const schoolId = await getTenantId();
  try {
    const body = await request.json();
    
    const expenses = await readData<any>('expenses.json', schoolId);
    const newId = await generateId('expenses.json', schoolId);

    const newExpense = { 
      ...body, 
      id: newId, 
      schoolId,
      date: body.date || new Date().toISOString()
    };
    
    expenses.push(newExpense);
    await writeData('expenses.json', expenses, schoolId);

    return NextResponse.json(newExpense);
  } catch (err: any) {
    console.error(`Local JSON Expenses POST Error for ${schoolId}:`, err);
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const schoolId = await getTenantId();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    let expenses = await readData<any>('expenses.json', schoolId);
    expenses = expenses.filter((e: any) => e.id.toString() !== id.toString());
    await writeData('expenses.json', expenses, schoolId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`Local JSON Expenses DELETE Error for ${schoolId}:`, err);
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { readData, writeData, generateId } from '@/lib/fileHandler';

// --- TypeScript Interface ---
interface Expense {
  id: number;
  category: string;
  amount: number;
  description: string;
  date: string;
}

const FILE_NAME = 'expenses.json';

export async function GET(request: Request) {
  try {
    const expenses = await readData<Expense>(FILE_NAME);
    return NextResponse.json(expenses);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Input validation
    if (!body.category || typeof body.category !== 'string' || body.category.trim().length === 0) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }
    if (!body.amount || isNaN(Number(body.amount)) || Number(body.amount) <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    const expenses = await readData<Expense>(FILE_NAME);
    const id = await generateId(FILE_NAME);
    
    const newExpense: Expense = { 
      id, 
      category: body.category.trim(),
      amount: parseFloat(body.amount) || 0,
      description: body.description?.trim() || '',
      date: body.date || new Date().toISOString()
    };
    
    expenses.push(newExpense);
    await writeData(FILE_NAME, expenses);
    
    return NextResponse.json(newExpense);
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID missing' }, { status: 400 });

    const expenses = await readData<Expense>(FILE_NAME);
    const filtered = expenses.filter((e) => e.id.toString() !== id.toString());

    if (filtered.length === expenses.length) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    await writeData(FILE_NAME, filtered);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}

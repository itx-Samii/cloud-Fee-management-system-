import { NextResponse } from 'next/server';
import { readData, writeData, generateId } from '@/lib/fileHandler';

const FILE_NAME = 'classes.json';

export async function GET(request: Request) {
  try {
    const classes = await readData<any>(FILE_NAME);
    const students = await readData<any>('students.json').catch(() => []);

    const enrichedClasses = classes.map((c: any) => {
      const count = students.filter((s: any) => s.classId?.toString() === c.id.toString()).length;
      return { ...c, studentCount: count };
    });

    return NextResponse.json(enrichedClasses);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch classes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.name) return NextResponse.json({ error: 'Class name is required' }, { status: 400 });

    const classes = await readData<any>(FILE_NAME);
    const id = await generateId(FILE_NAME);
    
    // Check if class with same name and section exists
    const exists = classes.find((c: any) => c.name.toLowerCase() === body.name.toLowerCase() && (c.section || '').toLowerCase() === (body.section || '').toLowerCase());
    if (exists) {
      return NextResponse.json({ error: 'Class with this Name and Section already exists' }, { status: 400 });
    }

    const newClass = { 
      id, 
      name: body.name,
      section: body.section || '',
      createdAt: new Date().toISOString() 
    };
    
    classes.push(newClass);
    await writeData(FILE_NAME, classes);
    
    return NextResponse.json(newClass);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create class' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    let classes = await readData<any>(FILE_NAME);
    const initialLength = classes.length;
    classes = classes.filter((c: any) => c.id.toString() !== id);
    
    if (classes.length === initialLength) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    await writeData(FILE_NAME, classes);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete class' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, name, section } = body;
    
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    if (!name) return NextResponse.json({ error: 'Class name is required' }, { status: 400 });

    const classes = await readData<any>(FILE_NAME);
    const index = classes.findIndex((c: any) => c.id.toString() === id.toString());
    
    if (index === -1) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // Check if another class with same name and section exists
    const exists = classes.find((c: any) => 
      c.id.toString() !== id.toString() && 
      c.name.toLowerCase() === name.toLowerCase() && 
      (c.section || '').toLowerCase() === (section || '').toLowerCase()
    );
    
    if (exists) {
      return NextResponse.json({ error: 'Another class with this Name and Section already exists' }, { status: 400 });
    }

    classes[index] = { 
      ...classes[index], 
      name, 
      section: section || '',
      updatedAt: new Date().toISOString() 
    };
    
    await writeData(FILE_NAME, classes);
    return NextResponse.json(classes[index]);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update class' }, { status: 500 });
  }
}

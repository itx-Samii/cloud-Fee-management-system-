import { beforeAll, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ChallanDocument from '@/app/components/ChallanDocument';
import { GET as getBranding, PUT as saveBranding } from '@/app/api/challan-settings/route';
import { GET as getFees, POST as issueFees } from '@/app/api/fees/route';
import { GET as getPortal } from '@/app/api/portal/route';
import { POST as givePin } from '@/app/api/parents/route';
import { POST as parentLogin } from '@/app/api/portal/login/route';
import { POST as addStudent } from '@/app/api/students/route';
import { challanProfile } from '@/lib/challanProfile';
import { getDb } from '@/lib/db';
import { OTHER_SCHOOL, SCHOOL, call, resetDatabase, signInAs, signOut } from '../helpers';

beforeAll(resetDatabase);

const url = '/api/challan-settings';
const brand = {
  ...challanProfile(undefined, 'Harbour School'), schoolAddress: 'Lahore', bankName: 'Test Bank', bankBranch: 'Main Branch',
  bankAccountTitle: 'Harbour School Fees', bankAccountNo: '111-222', instituteId: '1234',
  paymentMethods: 'Pay at the bank or school office.', challanNote: 'Keep the stamped Student Copy.',
  logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+l95cAAAAASUVORK5CYII=',
};

it('controls editing by role and keeps each school’s bank details separate', async () => {
  signOut();
  expect((await call(getBranding, 'GET', url)).status).toBe(401);
  await signInAs('accountant');
  expect(await call(getBranding, 'GET', url)).toMatchObject({ status: 200, data: { configured: false, profile: { bankAccountNo: '' } } });
  expect((await call(saveBranding, 'PUT', url, brand)).status).toBe(403);
  await signInAs('admin');
  expect(await call(saveBranding, 'PUT', url, { ...brand, logo: 'https://example.test/logo.png' })).toMatchObject({ status: 400, data: { field: 'logo' } });
  expect(await call(saveBranding, 'PUT', url, { ...brand, schoolName: '' })).toMatchObject({ status: 400, data: { field: 'schoolName' } });
  expect(await call(saveBranding, 'PUT', url, brand)).toMatchObject({ status: 200, data: { configured: true, profile: brand } });
  await signInAs('admin', OTHER_SCHOOL, 'otherprincipal');
  expect(await call(getBranding, 'GET', url)).toMatchObject({ status: 200, data: { configured: false, profile: { bankAccountNo: '', logo: '' } } });
});

it('prints the same issued voucher with the same details from staff and parent views', async () => {
  await signInAs('admin');
  expect((await call(saveBranding, 'PUT', url, brand)).status).toBe(200);
  const phone = '03000001234';
  const add = (name: string, parentPhone: string) => call(addStudent, 'POST', '/api/students', {
    name, fatherName: 'Original guardian', parentPhone, monthlyFee: 1500, discount: 200,
    monthlyCharges: [{ label: 'Transport', amount: 300 }], annualCharges: 500,
  });
  const student = await add('Issued student name', phone);
  const neighbour = await add('Other family', '03000005678');
  expect(student.status).toBe(200);
  const issued = await call(issueFees, 'POST', '/api/fees', {
    month: 'November', year: '2026', studentIds: [student.data.id, neighbour.data.id],
  });
  expect(issued.status).toBe(200);
  const db = await getDb();
  await db`update students set name = 'Changed student name' where school_id = ${SCHOOL} and id = ${student.data.id}`;
  const [staffVoucher] = (await call(getFees, 'GET', `/api/fees?studentId=${student.data.id}`)).data;
  const staffBranding = (await call(getBranding, 'GET', url)).data.profile;
  const { data: { pin } } = await call(givePin, 'POST', '/api/parents', { phone });
  signOut();
  expect((await call(parentLogin, 'POST', '/api/portal/login', { phone, pin })).status).toBe(200);
  const parent = await call(getPortal, 'GET', '/api/portal');
  expect(parent.status).toBe(200);
  expect(parent.data.children).toHaveLength(1);
  expect(parent.data.challanProfile).toEqual(staffBranding);
  expect(staffBranding).toEqual(brand);
  expect(parent.data.children[0].name).toBe('Changed student name');
  const [parentVoucher] = parent.data.children[0].vouchers;
  expect(parentVoucher).toMatchObject({ id: staffVoucher.id, studentName: 'Issued student name', dueDate: staffVoucher.dueDate, amount: staffVoucher.amount });

  const common = { profile: staffBranding, settings: parent.data.settings };
  const staffHtml = renderToStaticMarkup(createElement(ChallanDocument, { ...common, voucher: staffVoucher }));
  const parentHtml = renderToStaticMarkup(createElement(ChallanDocument, { ...common, voucher: parentVoucher }));
  expect(parentHtml).toBe(staffHtml);
  for (const text of ['Bank Copy', 'Student Copy', 'INFORMATION', 'Test Bank', '111-222', 'Transport', 'Due Date', 'Issued student name']) {
    expect(parentHtml).toContain(text);
  }
  expect(parentHtml).not.toContain('Other family');
});

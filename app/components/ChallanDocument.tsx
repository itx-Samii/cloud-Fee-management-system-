import ChallanBill, { type ChallanVoucher } from './ChallanBill';
import type { ChallanProfile } from '@/lib/challanProfile';
import type { FeeSettings } from '@/lib/fees';
import type { FeeVoucher } from '@/lib/types';
import '../generate/generate.css';

export type IssuedChallan = ChallanVoucher & Pick<
  FeeVoucher, 'id' | 'month' | 'year' | 'status' | 'issueDate' | 'studentName' | 'fatherName' | 'admissionNumber' | 'className'
>;

/** The official school voucher, shared by staff printing and the parent portal. */
export default function ChallanDocument({ voucher: f, profile, settings }: {
  voucher: IssuedChallan; profile: ChallanProfile; settings: FeeSettings;
}) {
  const { schoolName, schoolAddress, logo, bankName, bankBranch, bankAccountTitle, bankAccountNo, instituteId, paymentMethods, challanNote } = profile;
  const bill = f.status === 'Paid' && f.paidTuition == null ? { ...f, paidTuition: f.amount } : f;
  const program = f.className && !/^Class (undefined|null)$/i.test(f.className) ? f.className : 'Unassigned';

  return (
    <article className="voucher-card shared-challan" aria-label={`Fee challan #${f.id}`}>
      {['Bank Copy', 'Student Copy', 'Information'].map((section, sectionIdx) => (
        <div key={section} className="voucher-copy">
          {/* eslint-disable-next-line @next/next/no-img-element -- school logo is a validated data URL; next/image can't optimise it */}
          {logo && <img src={logo} alt="" className="logo-watermark" />}
          <div className="voucher-content">
             {sectionIdx < 2 ? (
               <>
                 <div className="copy-header">{section}</div>
                 <div style={{textAlign: 'center', marginBottom: '2mm'}}>
                    <h4 style={{margin: 0, fontSize: '10pt'}}>{bankName || 'School office'}</h4>
                    <p style={{margin: 0, fontSize: '7pt'}}>{bankBranch}</p>
                    {bankAccountNo && <p style={{margin: '0.5mm 0', fontSize: '7pt', fontWeight: 700}}>( {bankAccountNo} )</p>}
                 </div>

                 {bankAccountTitle && <div style={{border: '1px solid #000', padding: '1mm', fontSize: '8pt', marginBottom: '2mm', textAlign: 'center'}}><strong>A/C Title: {bankAccountTitle}</strong></div>}

                 <div className="info-grid">
                    <div className="info-item"><strong>Document No</strong> <span>{f.id}</span></div>
                    <div className="info-item"><strong>Date</strong> <span>{f.issueDate ? new Date(f.issueDate).toLocaleDateString('en-GB') : '—'}</span></div>
                    <div className="info-item"><strong>Student Name</strong> <span>{f.studentName}</span></div>
                    <div className="info-item"><strong>Father Name</strong> <span>{f.fatherName}</span></div>
                    <div className="info-item"><strong>Student ID</strong> <span>{f.admissionNumber || 'N/A'}</span></div>
                    <div className="info-item"><strong>Session</strong> <span>{f.month} {f.year}</span></div>
                    <div className="info-item"><strong>Program</strong> <span>{program}</span></div>
                    <div className="info-item"><strong>Institute ID</strong> <span>{instituteId || '—'}</span></div>
                 </div>

                 <ChallanBill voucher={bill} settings={settings} savedDueDateOnly />

                 <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto'}}>
                    <div style={{textAlign: 'center', fontSize: '7pt', width: '120px', borderTop: '0.5pt solid #000', paddingTop: '1mm'}}>Student Signature</div>
                    <div style={{textAlign: 'center', fontSize: '7pt', width: '120px', borderTop: '0.5pt solid #000', paddingTop: '1mm'}}>Cashier Stamp</div>
                 </div>
               </>
             ) : (
               <>
                 <div className="copy-header">INFORMATION</div>
                 <div style={{fontSize: '8pt', whiteSpace: 'pre-line', lineHeight: '1.4'}}>
                    {paymentMethods || 'Contact the school office for payment instructions.'}
                 </div>

                 <div style={{marginTop: 'auto', borderTop: '1pt solid #eee', paddingTop: '3mm'}}>
                    <div style={{fontSize: '8pt', fontWeight: 700, marginBottom: '2mm'}}>Important Notes:</div>
                    <p style={{fontSize: '7pt', color: '#444', margin: 0}}>{challanNote}</p>
                 </div>

                 <div style={{textAlign: 'center', marginTop: '5mm'}}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- school logo is a validated data URL; next/image can't optimise it */}
                    {logo && <img src={logo} alt="Logo" style={{width: '80px', height: '80px', objectFit: 'contain', opacity: 0.8}} />}
                    <div style={{fontSize: '9pt', fontWeight: 800, marginTop: '2mm'}}>{schoolName}</div>
                    <div style={{fontSize: '7pt'}}>{schoolAddress}</div>
                 </div>
               </>
             )}
          </div>
        </div>
      ))}
    </article>
  );
}

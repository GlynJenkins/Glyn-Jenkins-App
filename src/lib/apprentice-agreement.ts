/**
 * Basic apprenticeship agreement text — signed at enrolment when the selected
 * role is `apprentice`, in place of the self-employed subcontract agreement.
 *
 * Wire-up (mirror the subcontract flow): when role === 'apprentice', show these
 * lines + the SignaturePad, require the signature + an "I agree" tick, and
 * generate a signed apprenticeship PDF (copy generate-subcontract-pdf.ts →
 * generate-apprentice-pdf.ts, or parameterise it with these lines). Apprentices
 * already skip UTR/CIS tax type, so no change there.
 *
 * ⚠️ STARTING TEMPLATE ONLY — not final legal wording. A full England
 * apprenticeship also legally requires an apprenticeship *commitment statement /
 * training plan* signed by employer, apprentice and training provider, plus
 * compliance with apprentice minimum wage, minimum duration and off-the-job
 * training rules. Have this reviewed by an employment solicitor or your training
 * provider before use.
 */
export const APPRENTICE_AGREEMENT_LINES: string[] = [
  'This agreement is entered into between Glyn Jenkins LTD (the "Company") and the apprentice named in this registration form (the "Apprentice").',
  '',
  '## 1. STATUS',
  'The Apprentice is employed by the Company as an apprentice and not as a self-employed subcontractor. The Apprentice is an employee of the Company for the duration of the apprenticeship, subject to the terms of this agreement and any separate apprenticeship documents provided by the Company or its training provider.',
  '',
  '## 2. APPRENTICESHIP & TRAINING',
  'The Apprentice is engaged to learn the trade under the supervision of the Company\'s foremen and skilled operatives, while working towards a recognised qualification. The Apprentice agrees to attend all college, training and off-the-job learning as required, to complete all coursework and assessments, and to apply themselves diligently to their training and development.',
  '',
  '## 3. PAY',
  'The Apprentice will be paid on a fortnightly basis at the rate agreed with the Company, which will be no less than the applicable National Minimum Wage rate for apprentices. Income Tax and National Insurance are deducted through PAYE. College days and holiday days are paid in accordance with Company policy and are recorded through the Company\'s workforce system.',
  '',
  '## 4. HOURS, DUTIES & SUPERVISION',
  'The Apprentice will work the hours notified by the Company and will carry out duties under the direction and supervision of the foreman and skilled operatives. The Apprentice agrees to follow all reasonable instructions and to attend both site and training as scheduled.',
  '',
  '## 5. HOLIDAY & LEAVE',
  'The Apprentice is entitled to paid annual leave in accordance with statutory entitlement and Company policy. Holiday and college days are tracked through the Company\'s system. Leave should be requested and agreed in advance where possible.',
  '',
  '## 6. CSCS COMPLIANCE',
  'The Apprentice confirms their CSCS card (where held) is valid and will remain valid throughout their engagement. The Company reserves the right to suspend access to site if the CSCS card expires.',
  '',
  '## 7. RIGHT TO WORK',
  'The Apprentice confirms they have the legal right to work in the United Kingdom and that all documents submitted are genuine and belong to them.',
  '',
  '## 8. CONDUCT & SAFETY',
  'The Apprentice agrees to comply with all site health and safety rules, to follow instructions from the foreman, to conduct themselves professionally, and to commit to their learning and development. Failure to comply may result in disciplinary action in accordance with Company procedures.',
  '',
  '## 9. PROBATION & TERMINATION',
  'The apprenticeship may be subject to an initial probationary period. Either party may end the agreement by giving notice in accordance with the law and Company policy. The Company reserves the right to act immediately in cases of gross misconduct or serious safety breaches.',
  '',
  '## 10. GOVERNING LAW',
  'This agreement is governed by the laws of England and Wales.',
  '',
  '## APPRENTICE DECLARATION',
  'This Declaration forms part of the Apprenticeship Agreement between Glyn Jenkins Ltd and the Apprentice.',
  '',
  '## Employment Status',
  '1. I understand that I am employed by Glyn Jenkins Ltd as an apprentice, and that I am an employee — not a self-employed subcontractor.',
  '2. I understand that I am entitled to employment rights in line with my employment, including paid holiday and statutory entitlements.',
  '3. I understand that my Income Tax and National Insurance will be deducted through PAYE by the Company.',
  '',
  '## Training & Commitment',
  '4. I agree to attend all college, training and off-the-job learning required to complete my apprenticeship.',
  '5. I agree to apply myself diligently to my training, to complete all coursework and assessments, and to work towards my qualification.',
  '6. I understand that my apprenticeship combines paid work on site with training, both of which I am expected to attend.',
  '',
  '## Conduct, Safety & Quality',
  '7. I agree to follow all site health and safety rules and reasonable instructions from the foreman and skilled operatives.',
  '8. I understand that I am learning my trade and will carry out work under supervision to the standard required.',
  '9. I confirm my CSCS card (where held) is valid, and I have the legal right to work in the United Kingdom.',
  '',
  '## General Declaration',
  '10. I have read and understood this Apprenticeship Agreement.',
  '11. I have been given the opportunity to seek independent advice, or to ask a parent, guardian or the Company any questions, before signing.',
  '12. I confirm that all information provided by me is true and accurate.',
  '13. I acknowledge that this Declaration forms part of the arrangements between myself and Glyn Jenkins Ltd.',
  '',
  'Confirmation: By signing this Declaration and the Apprenticeship Agreement, I confirm that I have read, understood and voluntarily accepted its terms, and that I am entering into employment with Glyn Jenkins Ltd as an apprentice.',
]

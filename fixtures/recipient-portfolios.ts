import type { RecipientSource } from '../src/shared/contracts';

export const SPECIALTIES = ['Procurement', 'Payments', 'Local government', 'Labor', 'Worker safety', 'Environment', 'Water quality'] as const;

export type PortfolioFixture = {
  id: string; name: string; publication: string; role: string; region: string;
  bio: string; sources: RecipientSource[];
  seedEvidence: { specialty: string; sourceId: string; quote: string }[];
};

// These are deliberately fictional portfolios. No real journalist is enrolled,
// endorsed, or assigned a political position by this demonstration.
export const PORTFOLIOS: PortfolioFixture[] = [
  {
    id: 'maya-chen', name: 'Maya Chen', publication: 'The Borough Ledger',
    role: 'Investigative reporter', region: 'Brooklyn, New York',
    bio: 'Fictional reporter investigating how local government contracts turn into payments.',
    sources: [
      { id: 'maya-contracts', kind: 'fictional-demo', title: 'When the invoice and the transfer do not match', text: 'FICTIONAL DEMO ARTICLE\nBy Maya Chen, The Borough Ledger\nBrooklyn, New York\nMaya Chen investigates Procurement and Payments. Her review compared supplier invoices with completed bank transfers for municipal repair work. One payment exceeded the invoice; the team sought the original invoice, payment authorization, and bank confirmation before drawing conclusions. The article explains why a difference can be a reporting lead without establishing fraud: a separate invoice, advance, or approved amendment might explain it.' },
      { id: 'maya-oversight', kind: 'fictional-demo', title: 'Following the approval trail for neighborhood repairs', text: 'FICTIONAL DEMO ARTICLE\nBy Maya Chen, The Borough Ledger\nBrooklyn, New York\nMaya Chen covers Local government and Procurement. This investigation traced contractor selection, payment approvals, and change orders for drainage repairs. The reporting used invoice references and contract identifiers to connect records. Interviews with procurement staff helped distinguish an accounting mistake from an unexplained transfer. The fictional newsroom accepts documentary tips about public contracting.' },
    ],
    seedEvidence: [
      { specialty: 'Procurement', sourceId: 'maya-contracts', quote: 'Maya Chen investigates Procurement and Payments.' },
      { specialty: 'Payments', sourceId: 'maya-contracts', quote: 'Maya Chen investigates Procurement and Payments.' },
      { specialty: 'Local government', sourceId: 'maya-oversight', quote: 'Maya Chen covers Local government and Procurement.' },
    ],
  },
  {
    id: 'luis-rivera', name: 'Luis Rivera', publication: 'Workers Record',
    role: 'Labor correspondent', region: 'Queens, New York',
    bio: 'Fictional reporter investigating wages, job-site conditions, and worker retaliation.',
    sources: [
      { id: 'luis-wages', kind: 'fictional-demo', title: 'The hours missing from the pay stub', text: 'FICTIONAL DEMO ARTICLE\nBy Luis Rivera, Workers Record\nQueens, New York\nLuis Rivera reports on Labor. Workers shared time sheets and pay stubs showing differences between hours worked and hours paid. The investigation compared payroll records with shift schedules and interviewed workers about wage deductions. The article focused on employment conditions rather than supplier invoicing.' },
      { id: 'luis-safety', kind: 'fictional-demo', title: 'What a job-site safety log leaves out', text: 'FICTIONAL DEMO ARTICLE\nBy Luis Rivera, Workers Record\nQueens, New York\nLuis Rivera covers Worker safety and Labor. The reporting compared incident logs, equipment inspection records, and accounts from construction crews. Workers described pressure not to report injuries. The fictional publication accepts tips about employment practices and safety conditions.' },
    ],
    seedEvidence: [
      { specialty: 'Labor', sourceId: 'luis-wages', quote: 'Luis Rivera reports on Labor.' },
      { specialty: 'Worker safety', sourceId: 'luis-safety', quote: 'Luis Rivera covers Worker safety and Labor.' },
    ],
  },
  {
    id: 'priya-shah', name: 'Priya Shah', publication: 'Watershed Review',
    role: 'Environment reporter', region: 'Hudson Valley, New York',
    bio: 'Fictional reporter investigating pollution, water testing, and environmental enforcement.',
    sources: [
      { id: 'priya-water', kind: 'fictional-demo', title: 'Reading the river test results', text: 'FICTIONAL DEMO ARTICLE\nBy Priya Shah, Watershed Review\nHudson Valley, New York\nPriya Shah investigates Water quality and Environment. Her reporting compared laboratory samples, discharge permits, and downstream testing. The article explains why sampling dates, detection limits, and chain-of-custody records matter when assessing contamination. The investigation did not examine contractor payment records.' },
      { id: 'priya-enforcement', kind: 'fictional-demo', title: 'The long wait after a pollution notice', text: 'FICTIONAL DEMO ARTICLE\nBy Priya Shah, Watershed Review\nHudson Valley, New York\nPriya Shah covers Environment and Local government. This investigation followed environmental inspection findings and the agency response to a discharge violation. Public notices and inspection records showed when officials learned of the problem. The fictional publication accepts evidence about environmental harm and enforcement failures.' },
    ],
    seedEvidence: [
      { specialty: 'Water quality', sourceId: 'priya-water', quote: 'Priya Shah investigates Water quality and Environment.' },
      { specialty: 'Environment', sourceId: 'priya-water', quote: 'Priya Shah investigates Water quality and Environment.' },
      { specialty: 'Local government', sourceId: 'priya-enforcement', quote: 'Priya Shah covers Environment and Local government.' },
    ],
  },
];

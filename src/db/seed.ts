/**
 * Synthetic demo data (no real patients).
 * Seeds realistic clinical profiles across the 4 referral tiers:
 * - ASHA (a/b/c) -> CBAC Form + Refer to next PHC + AI Summary
 * - PHC (a/b/c) -> CBAC Form (editable) + Physical Exam + Reports (PDF) + Refer to DH + AI Summary
 * - DH (a/b/c) -> CBAC Form (editable) + Physical Exam + Reports + Biopsy Report (PDF) + Radiology Report (PDF) + DH Notes + Refer to TCC + AI Summary
 * - TCC (a/b/c) -> CBAC Form (editable) + Physical Exam + Reports + Biopsy Report (PDF) + Radiology Report (PDF) + TCC Notes + AI Summary
 */
import { addDays, nearestWeekdayIso, today } from '../intelligence/dates';
import { getDB, getMeta, notifyChange } from './db';
import { emptyFacility, makePatient, makeReferral } from './factory';
import type { FacilityEvent, FollowUp, Patient, Referral, ReportAttachment } from './types';

const SEED_VERSION = 7;
export const DEFAULT_WORKER = 'ASHA Rekha Devi';

function iso(day: string, hour = 10): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

function build() {
  const t = today();
  const synced = (day: string) => iso(day, 18);

  const patients: Patient[] = [
    // ASHA Patients
    makePatient({ id: 'CL-0001', name: 'Mary Kujur', age: 45, sex: 'F', phone: '9431201145', locality: 'Bero Village', syncStatus: 'pending' }),
    makePatient({ id: 'CL-0005', name: 'Geeta Kumari', age: 29, sex: 'F', phone: '9835109822', locality: 'Rampur Gaon', syncStatus: 'pending' }),
    makePatient({ id: 'CL-0006', name: 'Sunita Soren', age: 50, sex: 'F', phone: '7004128933', locality: 'Mandar Sector', syncStatus: 'pending' }),

    // PHC Patients
    makePatient({ id: 'CL-0002', name: 'Sunita Devi', age: 35, sex: 'F', phone: '9835012277', locality: 'Bero Block', syncStatus: 'synced' }),
    makePatient({ id: 'CL-0007', name: 'Anil Hansda', age: 52, sex: 'M', phone: '9431872201', locality: 'Itki Village', syncStatus: 'synced' }),

    // DH Patients
    makePatient({ id: 'CL-0003', name: 'Lakshmi Oraon', age: 42, sex: 'F', phone: '7004318862', locality: 'Ranchi Sadar Block', syncStatus: 'synced' }),
    makePatient({ id: 'CL-0008', name: 'Parvati Soren', age: 48, sex: 'F', phone: '9835219904', locality: 'Khunti Sub-district', syncStatus: 'synced' }),

    // TCC Patients
    makePatient({ id: 'CL-0004', name: 'Ramesh Mahto', age: 61, sex: 'M', phone: '9798440021', locality: 'Mandar High Range', syncStatus: 'synced' }),
    makePatient({ id: 'CL-0009', name: 'Bibha Bhattacharya', age: 56, sex: 'F', phone: '9431102944', locality: 'RIMS Oncology Ward', syncStatus: 'synced' }),
  ];

  // Sample PDF Attachments
  const samplePdfReports: Record<string, ReportAttachment> = {
    cbc: {
      id: 'att-cbc-01',
      title: 'Complete Blood Count & Metabolic Profile',
      fileName: 'LabReport_CBC_Biochem.pdf',
      fileSize: '1.2 MB',
      fileType: 'application/pdf',
      category: 'general',
      uploadedAt: iso(addDays(t, -2), 14),
      uploadedBy: 'PHC Clinical Laboratory',
      findings: 'Hb: 10.4 g/dL (Mild microcytic anemia). Fasting Glucose: 164 mg/dL. Normal renal panel (Creatinine 0.8 mg/dL).',
      dataUrl: 'sample-clinical-pdf',
    },
    sputum: {
      id: 'att-sputum-01',
      title: 'Sputum Smear & GeneXpert MTB Diagnostic',
      fileName: 'Sputum_GeneXpert_Report.pdf',
      fileSize: '1.4 MB',
      fileType: 'application/pdf',
      category: 'general',
      uploadedAt: iso(addDays(t, -3), 11),
      uploadedBy: 'NTEP Designated Microscopy Centre',
      findings: 'GeneXpert MTB detected (medium load), Rifampicin resistance not detected. Smear AFB positive (2+).',
      dataUrl: 'sample-clinical-pdf',
    },
    biopsyBreast: {
      id: 'att-bx-breast-01',
      title: 'Histopathology Biopsy Report — Surgical Pathology',
      fileName: 'Biopsy_Histopath_SurgPath_Breast.pdf',
      fileSize: '2.8 MB',
      fileType: 'application/pdf',
      category: 'biopsy',
      uploadedAt: iso(addDays(t, -4), 16),
      uploadedBy: 'Department of Pathology, Sadar DH Ranchi',
      findings: 'Sections show infiltrating ductal carcinoma (IDC) of breast. Tubule formation: score 3, Nuclear pleomorphism: score 2, Mitotic count: score 2. Total Nottingham score: 7/9 (Grade II). Desmoplastic stromal response present.',
      dataUrl: 'sample-clinical-pdf',
    },
    biopsyOral: {
      id: 'att-bx-oral-01',
      title: 'Incisional Biopsy — Buccal Mucosa Histopathology',
      fileName: 'Histopath_Buccal_Mucosa_Biopsy.pdf',
      fileSize: '3.1 MB',
      fileType: 'application/pdf',
      category: 'biopsy',
      uploadedAt: iso(addDays(t, -6), 15),
      uploadedBy: 'DH Surgical Pathology Division',
      findings: 'Moderately differentiated squamous cell carcinoma of right buccal mucosa. Keratin pearl formation noted. Perineural invasion identified. Depth of invasion: 6 mm.',
      dataUrl: 'sample-clinical-pdf',
    },
    biopsyCervix: {
      id: 'att-bx-cervix-01',
      title: 'Cervical Punch Biopsy & Endocervical Curettage',
      fileName: 'Cervical_Punch_Biopsy_Pathology.pdf',
      fileSize: '2.4 MB',
      fileType: 'application/pdf',
      category: 'biopsy',
      uploadedAt: iso(addDays(t, -5), 12),
      uploadedBy: 'Sadar Hospital Pathology Wing',
      findings: 'High-grade squamous intraepithelial lesion (HSIL / CIN-3) with areas suspicious for micro-invasion. Full-thickness atypia with high nuclear-cytoplasmic ratio.',
      dataUrl: 'sample-clinical-pdf',
    },
    radiologyMammo: {
      id: 'att-rad-mammo-01',
      title: 'Digital Bilateral Full-Field Mammography & USG',
      fileName: 'Digital_Mammography_Bilateral.pdf',
      fileSize: '4.2 MB',
      fileType: 'application/pdf',
      category: 'radiology',
      uploadedAt: iso(addDays(t, -4), 10),
      uploadedBy: 'DH Diagnostic Imaging Department',
      findings: 'Right breast upper outer quadrant reveals an irregular, dense spiculated mass measuring 2.3 x 1.8 cm with pleomorphic clustered microcalcifications. BI-RADS Category 5 (Highly suggestive of malignancy). Right axillary level 1 lymph node enlarged (1.5 cm).',
      dataUrl: 'sample-clinical-pdf',
    },
    radiologyCt: {
      id: 'att-rad-ct-01',
      title: 'Contrast-Enhanced CT Neck and Chest (CECT)',
      fileName: 'CECT_Neck_Chest_Imaging.pdf',
      fileSize: '5.6 MB',
      fileType: 'application/pdf',
      category: 'radiology',
      uploadedAt: iso(addDays(t, -7), 14),
      uploadedBy: 'Apex Radiology & Advanced Imaging',
      findings: 'Enhancing soft-tissue mass lesion involving right gingivobuccal sulcus and adjacent buccinator space (3.4 x 2.6 cm). Ipsilateral level IB and IIA lymphadenopathy (largest 2.1 cm with central necrosis). No pulmonary metastatic nodules. Clinical stage: cT2N2aM0.',
      dataUrl: 'sample-clinical-pdf',
    },
    radiologyMri: {
      id: 'att-rad-mri-01',
      title: 'Pelvic Contrast MRI & High-Resolution Abdomen Scan',
      fileName: 'Pelvic_MRI_HighResolution_Oncology.pdf',
      fileSize: '4.8 MB',
      fileType: 'application/pdf',
      category: 'radiology',
      uploadedAt: iso(addDays(t, -5), 11),
      uploadedBy: 'District Diagnostic Centre',
      findings: 'Cervical mass lesion measuring 2.8 cm in greatest dimension confined to cervix without parametrial extension. No pelvic lymphadenopathy. Stage IB2.',
      dataUrl: 'sample-clinical-pdf',
    },
  };

  const referrals: Referral[] = [
    // 1. ASHA Unit A: Mary Kujur (Grassroots screening, high NCD risk, oral white patch)
    makeReferral({
      id: 'REF-0001',
      patientId: 'CL-0001',
      tier: 'asha',
      unit: 'a',
      reason: 'Oral cavity non-healing white patch & CBAC score 6/12',
      destinationFacility: 'PHC Itki Unit A',
      referralDate: addDays(t, -1),
      urgency: 'soon',
      patientIntention: 'will_attend',
      notes: 'Screened at village health camp. Patient has 1.5 cm non-scrapable white patch in right cheek for 2 months. Advised prompt examination at PHC.',
      syncStatus: 'pending',
      screening: {
        completed: true,
        area: 'oral',
        finding: 'positive',
        referralRequired: 'yes',
        cbac: {
          general: {
            date: addDays(t, -1),
            ashaName: 'ASHA Rekha Devi',
            mpwAnmName: 'ANM Anita',
            villageWard: 'Bero Village Unit A',
            subCentre: 'Bero Subcentre A',
            phcUphc: 'PHC Itki',
            name: 'Mary Kujur',
            age: 45,
            sex: 'F',
            address: 'Bero Village',
            identifierType: 'Aadhaar',
            identifierNumber: 'XXXX-XXXX-4412',
            hasStateInsurance: true,
            insuranceDetails: 'Ayushman Bharat PMJAY',
            phone: '9431201145',
            phoneOwner: 'self',
            hasDisability: false,
            disabilityDetails: '',
          },
          partA: {
            ageScore: 2,
            smokeScore: 1,
            alcoholScore: 0,
            waistCm: 88,
            waistScore: 1,
            physicalActivityScore: 1,
            familyHistoryScore: 2,
            totalScore: 6,
          },
          partB: {
            symptoms: {
              oral_patch: true,
              persistent_cough: false,
              breast_lump: false,
            },
          },
          partC: {
            cookingFuel: ['firewood'],
            occupationalExposure: ['crop_burning'],
          },
          partD: {
            phq1Score: 1,
            phq2Score: 1,
            totalScore: 2,
          },
          highRiskNcd: true,
          symptomAlert: true,
          tbSuspectAlert: false,
          tbContactAlert: false,
          mentalHealthAlert: false,
          completedAt: iso(addDays(t, -1), 10),
        },
      },
    }),

    // 2. ASHA Unit B: Geeta Kumari (Routine screening)
    makeReferral({
      id: 'REF-0005',
      patientId: 'CL-0005',
      tier: 'asha',
      unit: 'b',
      reason: 'Routine Preventive CBAC Screening',
      destinationFacility: 'PHC Bero Unit B',
      referralDate: t,
      urgency: 'routine',
      patientIntention: 'will_attend',
      notes: 'General screening conducted during village home visit. Low NCD risk score.',
      syncStatus: 'pending',
      screening: {
        completed: true,
        area: 'ncd',
        finding: 'negative',
        referralRequired: 'no',
        cbac: {
          general: {
            date: t,
            ashaName: 'ASHA Poonam Soren',
            mpwAnmName: 'ANM Rita',
            villageWard: 'Rampur Village B',
            subCentre: 'Rampur Subcentre B',
            phcUphc: 'PHC Bero',
            name: 'Geeta Kumari',
            age: 29,
            sex: 'F',
            address: 'Rampur Gaon',
            identifierType: 'Aadhaar',
            identifierNumber: 'XXXX-XXXX-8921',
            hasStateInsurance: true,
            insuranceDetails: 'PMJAY',
            phone: '9835109822',
            phoneOwner: 'self',
            hasDisability: false,
            disabilityDetails: '',
          },
          partA: { ageScore: 0, smokeScore: 0, alcoholScore: 0, waistScore: 0, physicalActivityScore: 0, familyHistoryScore: 1, totalScore: 1 },
          partB: { symptoms: {} },
          partC: { cookingFuel: ['lpg'], occupationalExposure: [] },
          partD: { phq1Score: 0, phq2Score: 0, totalScore: 0 },
          highRiskNcd: false,
          symptomAlert: false,
          tbSuspectAlert: false,
          tbContactAlert: false,
          mentalHealthAlert: false,
          completedAt: iso(t, 10),
        },
      },
    }),

    // 3. ASHA Unit C: Sunita Soren (TB Suspect flag + cough)
    makeReferral({
      id: 'REF-0006',
      patientId: 'CL-0006',
      tier: 'asha',
      unit: 'c',
      reason: 'Persistent cough > 2 weeks & unintentional weight loss',
      destinationFacility: 'PHC Kanke Unit C',
      referralDate: addDays(t, -2),
      urgency: 'urgent',
      patientIntention: 'will_attend',
      notes: 'Patient coughing blood streaks. Urgent sputum examination and chest X-ray needed.',
      syncStatus: 'pending',
      screening: {
        completed: true,
        area: 'ncd',
        finding: 'positive',
        referralRequired: 'yes',
        cbac: {
          general: {
            date: addDays(t, -2),
            ashaName: 'ASHA Sunita Mahto',
            mpwAnmName: 'ANM Sangeeta',
            villageWard: 'Mandar Sector C',
            subCentre: 'Mandar Subcentre C',
            phcUphc: 'PHC Kanke',
            name: 'Sunita Soren',
            age: 50,
            sex: 'F',
            address: 'Mandar Sector',
            identifierType: 'Aadhaar',
            identifierNumber: 'XXXX-XXXX-9921',
            hasStateInsurance: true,
            insuranceDetails: 'PMJAY',
            phone: '7004128933',
            phoneOwner: 'self',
            hasDisability: false,
            disabilityDetails: '',
          },
          partA: { ageScore: 3, smokeScore: 0, alcoholScore: 0, waistScore: 1, physicalActivityScore: 0, familyHistoryScore: 1, totalScore: 5 },
          partB: { symptoms: { persistent_cough: true, blood_in_sputum: true, weight_loss: true } },
          partC: { cookingFuel: ['firewood', 'cow_dung_cake'], occupationalExposure: ['garbage_burning'] },
          partD: { phq1Score: 1, phq2Score: 1, totalScore: 2 },
          highRiskNcd: true,
          symptomAlert: true,
          tbSuspectAlert: true,
          tbContactAlert: false,
          mentalHealthAlert: false,
          completedAt: iso(addDays(t, -2), 10),
        },
      },
    }),

    // 4. PHC Unit B: Sunita Devi (Physical exam recorded, CBC attached, referred to DH)
    makeReferral({
      id: 'REF-0002',
      patientId: 'CL-0002',
      tier: 'phc',
      unit: 'b',
      reason: 'Clinical workup of persistent buccal lesion & borderline hypertension',
      destinationFacility: 'Sadar District Hospital Ranchi (DH Unit A)',
      referralDate: addDays(t, -2),
      urgency: 'soon',
      patientIntention: 'will_attend',
      notes: 'Examined at PHC Bero. BP 138/88. CBC lab panel attached. Recommending DH dental/surgical biopsy.',
      syncStatus: 'synced',
      lastSyncedAt: synced(addDays(t, -1)),
      physicalExam: {
        bpSystolic: 138,
        bpDiastolic: 88,
        pulseRate: 78,
        spo2: 98,
        temperature: 98.4,
        weightKg: 58,
        heightCm: 156,
        bmi: 23.8,
        generalFindings: 'Conscious, oriented, mild pallor noted. No pedal edema.',
        systemicExam: 'Respiratory: Normal vesicular breath sounds. CVS: S1 S2 heard, no murmurs. Abdomen: Soft, non-tender.',
        oralCavityFindings: 'Right buccal mucosa exhibits a granular white-erythematous plaque measuring 1.6 x 1.2 cm. Indurated base on palpation.',
        recordedAt: iso(addDays(t, -2), 11),
        recordedBy: 'Dr. Rajesh Verma, Medical Officer PHC Bero',
      },
      reports: [samplePdfReports.cbc],
      facility: { ...emptyFacility(), response: 'accepted', updatedAt: iso(addDays(t, -1), 11) },
    }),

    // 5. PHC Unit A: Anil Hansda (Chronic cough & sputum, referred to DH)
    makeReferral({
      id: 'REF-0007',
      patientId: 'CL-0007',
      tier: 'phc',
      unit: 'a',
      reason: 'GeneXpert MTB positive & bilateral wheeze, DH chest specialist evaluation',
      destinationFacility: 'Sadar District Hospital Ranchi (DH Unit A)',
      referralDate: addDays(t, -3),
      urgency: 'urgent',
      patientIntention: 'will_attend',
      notes: 'Sputum GeneXpert report confirms MTB. Sputum PDF attached. Immediate DOTS regimen and chest imaging at DH.',
      syncStatus: 'synced',
      lastSyncedAt: synced(addDays(t, -2)),
      physicalExam: {
        bpSystolic: 142,
        bpDiastolic: 90,
        pulseRate: 84,
        spo2: 95,
        temperature: 99.2,
        weightKg: 52,
        heightCm: 168,
        bmi: 18.4,
        generalFindings: 'Underweight, febrile spikes in evening, cachectic appearance.',
        systemicExam: 'Chest: Bilateral coarse crepitations in upper zones with rhonchi. Heart sounds normal.',
        recordedAt: iso(addDays(t, -3), 10),
        recordedBy: 'Dr. Ananya Roy, MO PHC Itki',
      },
      reports: [samplePdfReports.sputum],
      facility: { ...emptyFacility(), response: 'accepted', updatedAt: iso(addDays(t, -2), 14) },
    }),

    // 6. DH Unit A: Lakshmi Oraon (Physical Exam, CBC + Biopsy + Radiology PDFs, DH Notes, Referred to TCC)
    makeReferral({
      id: 'REF-0003',
      patientId: 'CL-0003',
      tier: 'dh',
      unit: 'a',
      reason: 'Confirmed Infiltrating Ductal Carcinoma (Grade II) · BI-RADS 5 Mammogram',
      destinationFacility: 'RIMS Regional Cancer Centre (TCC Unit A)',
      referralDate: addDays(t, -4),
      urgency: 'urgent',
      patientIntention: 'will_attend',
      notes: 'Histopathology biopsy confirms IDC Grade II (Nottingham score 7). Digital mammogram confirms 2.3 cm spiculated mass (BI-RADS 5). DH Tumor Board recommends immediate tertiary referral to TCC for receptor profiling (ER/PR/HER2) and neoadjuvant protocol.',
      syncStatus: 'synced',
      lastSyncedAt: synced(t),
      physicalExam: {
        bpSystolic: 126,
        bpDiastolic: 82,
        pulseRate: 74,
        spo2: 99,
        temperature: 98.4,
        weightKg: 64,
        heightCm: 160,
        bmi: 25.0,
        generalFindings: 'Good performance status (ECOG 0). No palpable supraclavicular lymph nodes.',
        systemicExam: 'CVS & Respiratory within normal limits. Abdomen soft, no hepatomegaly.',
        breastExamFindings: 'Right breast upper outer quadrant reveals 2.3 x 1.8 cm firm, ill-defined lump, non-tender, mobile over pectoralis major. Nipple-areolar complex intact without discharge. Single 1.5 cm mobile right axillary lymph node palpable.',
        recordedAt: iso(addDays(t, -4), 11),
        recordedBy: 'Dr. Sanjeev Kulkarni, Senior Surgeon DH Ranchi',
      },
      reports: [samplePdfReports.cbc],
      biopsyReports: [samplePdfReports.biopsyBreast],
      radiologyReports: [samplePdfReports.radiologyMammo],
      dhNotes: 'DH Clinical Staging: cT2N1M0 (Stage IIB). Core needle biopsy confirms invasive ductal carcinoma. All pathology and imaging PDFs attached. Referring directly to TCC RIMS for multidisciplinary oncology care.',
      facility: { ...emptyFacility(), response: 'received', updatedAt: iso(t, 10) },
    }),

    // 7. DH Unit B: Parvati Soren (Cervical Punch Biopsy, MRI Report, DH Notes, Referred to TCC)
    makeReferral({
      id: 'REF-0008',
      patientId: 'CL-0008',
      tier: 'dh',
      unit: 'b',
      reason: 'Cervical HSIL / CIN-3 with micro-invasion on biopsy · Stage IB2 MRI',
      destinationFacility: 'State Apex Cancer Institute (TCC Unit B)',
      referralDate: addDays(t, -5),
      urgency: 'urgent',
      patientIntention: 'will_attend',
      notes: 'Cervical punch biopsy pathology and pelvic MRI reports attached. Refer to TCC gynecologic oncology unit.',
      syncStatus: 'synced',
      lastSyncedAt: synced(addDays(t, -4)),
      physicalExam: {
        bpSystolic: 130,
        bpDiastolic: 84,
        pulseRate: 76,
        spo2: 98,
        temperature: 98.6,
        weightKg: 55,
        heightCm: 154,
        bmi: 23.2,
        cervicalExamFindings: 'Per speculum: 2.8 cm exophytic cervical growth with contact bleeding. Parametrium supple on rectal examination.',
        recordedAt: iso(addDays(t, -5), 10),
        recordedBy: 'Dr. Meena Tirkey, Consultant Gynecologist DH Khunti',
      },
      reports: [samplePdfReports.cbc],
      biopsyReports: [samplePdfReports.biopsyCervix],
      radiologyReports: [samplePdfReports.radiologyMri],
      dhNotes: 'Clinical diagnosis Stage IB2 Cervical Carcinoma. Patient counseled regarding surgical staging vs concurrent chemoradiation at TCC.',
      facility: { ...emptyFacility(), response: 'accepted', updatedAt: iso(addDays(t, -4), 11) },
    }),

    // 8. TCC Unit A: Ramesh Mahto (Stage III Oral SCC, Biopsy + CT Neck, TCC Notes, Multidisciplinary Onco Review)
    makeReferral({
      id: 'REF-0004',
      patientId: 'CL-0004',
      tier: 'tcc',
      unit: 'a',
      reason: 'Stage III (cT2N2aM0) Oral Squamous Cell Carcinoma · Multidisciplinary Tumor Board',
      destinationFacility: 'RIMS Regional Cancer Centre (TCC Unit A)',
      referralDate: addDays(t, -12),
      urgency: 'urgent',
      patientIntention: 'will_attend',
      notes: 'Comprehensive oncology management at TCC. Biopsy shows moderately differentiated SCC. Contrast CT Neck shows 3.4 cm primary mass and Level 1B lymphadenopathy. MDT consensus: Neoadjuvant chemotherapy (Cisplatin + 5FU) followed by composite resection and neck dissection.',
      syncStatus: 'synced',
      lastSyncedAt: synced(addDays(t, -1)),
      physicalExam: {
        bpSystolic: 134,
        bpDiastolic: 86,
        pulseRate: 80,
        spo2: 97,
        temperature: 98.4,
        weightKg: 59,
        heightCm: 164,
        bmi: 21.9,
        generalFindings: 'ECOG performance status 1. Trismus mild (inter-incisal opening 28 mm).',
        oralCavityFindings: 'Exophytic ulcerative lesion 3.4 x 2.6 cm right gingivobuccal sulcus extending into lower alveolus. Fixity to periosteum present.',
        recordedAt: iso(addDays(t, -8), 10),
        recordedBy: 'Prof. Dr. K. N. Banerjee, Senior Surgical Oncologist TCC',
      },
      reports: [samplePdfReports.cbc],
      biopsyReports: [samplePdfReports.biopsyOral],
      radiologyReports: [samplePdfReports.radiologyCt],
      dhNotes: 'Previous DH referral: Primary lesion biopsied, preliminary CT ordered and patient referred to TCC.',
      tccNotes: 'TCC Multidisciplinary Tumor Board (MDT): Stage III (cT2N2aM0) oral SCC. Plan: Cycle 1 Cisplatin 75 mg/m2 + 5-FU 750 mg/m2 initiated. Post-chemo reassessment via CT neck scheduled at 6 weeks for composite resection and reconstruction.',
      facility: {
        ...emptyFacility(),
        response: 'accepted',
        appointmentDate: addDays(t, 2),
        attendance: 'attended',
        updatedAt: iso(addDays(t, -1), 10),
      },
    }),

    // 9. TCC Unit B: Bibha Bhattacharya (Metastatic evaluation & radiation planning)
    makeReferral({
      id: 'REF-0009',
      patientId: 'CL-0009',
      tier: 'tcc',
      unit: 'b',
      reason: 'Post-mastectomy Adjuvant Radiotherapy & Chemotherapy Protocol',
      destinationFacility: 'State Apex Cancer Institute (TCC Unit B)',
      referralDate: addDays(t, -7),
      urgency: 'soon',
      patientIntention: 'will_attend',
      notes: 'Receptor Status: ER+, PR+, HER2-. Commencing adjuvant endocrine therapy (Letrozole) and chest wall intensity-modulated radiotherapy (IMRT).',
      syncStatus: 'synced',
      lastSyncedAt: synced(addDays(t, -2)),
      physicalExam: {
        bpSystolic: 122,
        bpDiastolic: 78,
        pulseRate: 72,
        spo2: 99,
        temperature: 98.4,
        weightKg: 62,
        heightCm: 158,
        bmi: 24.8,
        generalFindings: 'Well-healed right modified radical mastectomy surgical scar. No arm lymphedema.',
        recordedAt: iso(addDays(t, -6), 11),
        recordedBy: 'Dr. Sharmila Sen, Radiation Oncologist TCC',
      },
      reports: [samplePdfReports.cbc],
      biopsyReports: [samplePdfReports.biopsyBreast],
      radiologyReports: [samplePdfReports.radiologyMammo],
      tccNotes: 'Adjuvant radiotherapy simulation complete. 50 Gy in 25 fractions to chest wall and supraclavicular fossa. Patient scheduled for daily treatment.',
      facility: { ...emptyFacility(), response: 'accepted', appointmentDate: addDays(t, 1), updatedAt: iso(t, 9) },
    }),
  ];

  const followUps: FollowUp[] = [
    { id: 'fu-seed-1', referralId: 'REF-0001', at: iso(addDays(t, -1), 12), action: 'contacted_patient', note: 'Mary confirmed she has arranged transport to PHC Itki for oral checkup.', suggestedAction: 'confirm_referral', syncStatus: 'synced' },
    { id: 'fu-seed-2', referralId: 'REF-0002', at: iso(addDays(t, -2), 15), action: 'appointment_confirmed', note: 'Sunita scheduled with DH surgical clinic.', data: { date: addDays(t, 3) }, suggestedAction: 'remind_patient', syncStatus: 'synced' },
    { id: 'fu-seed-3', referralId: 'REF-0003', at: iso(addDays(t, -3), 16), action: 'details_completed', note: 'Biopsy and Mammogram PDF reports uploaded and validated.', suggestedAction: 'plan_follow_up', syncStatus: 'synced' },
    { id: 'fu-seed-4', referralId: 'REF-0004', at: iso(addDays(t, -8), 10), action: 'patient_attended', note: 'Attended Tumor Board review. Chemotherapy cycle 1 administered.', suggestedAction: 'record_outcome', syncStatus: 'synced' },
  ];

  const facilityEvents: FacilityEvent[] = [
    { id: 'fe-seed-1', referralId: 'REF-0002', at: iso(addDays(t, -2), 10), kind: 'acknowledged' },
    { id: 'fe-seed-2', referralId: 'REF-0002', at: iso(addDays(t, -1), 11), kind: 'accepted', text: 'PHC referral accepted. Diagnostic blood work completed.' },
    { id: 'fe-seed-3', referralId: 'REF-0003', at: iso(t, 10), kind: 'acknowledged', text: 'DH oncology referral received with attached Biopsy and Radiology PDFs.' },
    { id: 'fe-seed-4', referralId: 'REF-0004', at: iso(addDays(t, -9), 9), kind: 'scheduled', text: 'TCC multidisciplinary appointment scheduled.' },
  ];

  return { patients, referrals, followUps, facilityEvents };
}

export async function seedIfEmpty(): Promise<void> {
  if ((await getMeta<number>('seed_version')) === SEED_VERSION) return;
  await resetDemoData();
}

export async function resetDemoData(): Promise<void> {
  const db = await getDB();
  const { patients, referrals, followUps, facilityEvents } = build();
  const stores = [
    'patients', 'referrals', 'followups', 'facility_events', 'outbox', 'sync_events',
    'remote_patients', 'remote_referrals', 'remote_followups', 'remote_facility_events',
  ] as const;
  const tx = db.transaction([...stores, 'meta'], 'readwrite');
  for (const s of stores) await tx.objectStore(s).clear();

  const now = new Date().toISOString();
  for (const p of patients) {
    await tx.objectStore('patients').put(p);
    if (p.syncStatus === 'pending') await tx.objectStore('outbox').put({ id: `patient:${p.id}`, entity: 'patient', entityId: p.id, at: now });
    else await tx.objectStore('remote_patients').put(p);
  }
  for (const r of referrals) {
    await tx.objectStore('referrals').put(r);
    if (r.syncStatus === 'pending') await tx.objectStore('outbox').put({ id: `referral:${r.id}`, entity: 'referral', entityId: r.id, at: now });
    else await tx.objectStore('remote_referrals').put(r);
  }
  for (const f of followUps) {
    await tx.objectStore('followups').put(f);
    await tx.objectStore('remote_followups').put(f);
  }
  for (const e of facilityEvents) {
    await tx.objectStore('facility_events').put(e);
    await tx.objectStore('remote_facility_events').put(e);
  }
  const meta = tx.objectStore('meta');
  await meta.put({ key: 'counter_patient', value: patients.length });
  await meta.put({ key: 'counter_referral', value: referrals.length });
  await meta.put({ key: 'seed_version', value: SEED_VERSION });
  await tx.done;
  notifyChange();
}

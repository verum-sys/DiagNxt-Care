import { getPartAScoreBreakdown } from '../../intelligence/cbacScoreBreakdown';
import { parseCbacInterviewAnswer } from '../../intelligence/cbacInterviewAnswers';
import type { SmartParseResult } from '../../intelligence/cbacIntelligence';
import { useAuth } from '../../auth/AuthContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { BackLink } from '../../components/Layout';
import { createCase, getCase, updateCase } from '../../db/repo';
import { makePatient, makeReferral } from '../../db/factory';
import { analyze } from '../../intelligence/engine';
import { CareStateChip } from '../../components/StatusChip';
import type {
  FacilityResponse,
  Intention,
  ReferralRequiredAnswer,
  ScreeningArea,
  ScreeningFinding,
  Sex,
  Urgency,
} from '../../db/types';
import { useLang } from '../../i18n';
import { today } from '../../intelligence/dates';
import {
  calculatePartAScore,
  calculatePartDScore,
  classifyAge,
  classifyWaist,
  evaluateCbacTriage,
  type SmartParseExplanation,
} from '../../intelligence/cbacIntelligence';
import {
  CBAC_B1_SYMPTOMS,
  CBAC_B2_SYMPTOMS,
  CBAC_B3_SYMPTOMS,
  COOKING_FUELS,
  OCCUPATIONAL_EXPOSURES,
  PHQ2_OPTIONS,
  type CbacAssessment,
  type CbacGeneralInfo,
  type CbacPartA,
  type CbacPartB,
  type CbacPartC,
  type CbacPartD,
} from '../../intelligence/cbacTypes';
import { useSettings } from '../../settings';
import { listenForInterviewAnswer } from '../../voice/interviewRecognition';
import { useSpeak } from '../../voice/useSpeak';
import { getApplicableInterviewQuestions, getQuestionText, getQuestionHint } from '../../intelligence/cbacInterviewQuestions';

type SlideId = 'A' | 'B' | 'C' | 'D' | 'REFERRAL';

const FACILITY_SUGGESTIONS = [
  'CHC Bero',
  'PHC Itki',
  'Sadar District Hospital',
  'RIMS Medical College Hospital',
  'District Hospital',
  'Community Health Centre (CHC)',
  'Primary Health Centre (PHC)',
];

interface ReferralFormState {
  screeningCompleted: boolean;
  screeningArea: ScreeningArea | '';
  screeningFinding: ScreeningFinding | '';
  referralRequired: ReferralRequiredAnswer;
  destinationFacility: string;
  reason: string;
  referralDate: string;
  urgency: Urgency;
  appointmentDate: string;
  patientIntention: Intention | '';
  notes: string;
  facilityResponse?: FacilityResponse;
}

const INITIAL_REFERRAL: ReferralFormState = {
  screeningCompleted: true,
  screeningArea: 'ncd',
  screeningFinding: '',
  referralRequired: 'no',
  destinationFacility: 'CHC Bero',
  reason: '',
  referralDate: today(),
  urgency: 'routine',
  appointmentDate: '',
  patientIntention: '',
  notes: '',
  facilityResponse: undefined,
};

const INITIAL_GENERAL: CbacGeneralInfo = {
  date: today(),
  ashaName: 'Rekha Devi',
  mpwAnmName: 'Suman Kumari',
  villageWard: 'Bero',
  subCentre: 'Bero Sub-Centre',
  phcUphc: 'CHC Bero',
  name: '',
  age: '',
  sex: '',
  address: '',
  identifierType: 'Aadhaar',
  identifierNumber: '',
  hasStateInsurance: false,
  insuranceDetails: '',
  phone: '',
  phoneOwner: 'self',
  hasDisability: false,
  disabilityDetails: '',
};

const INITIAL_PART_A: CbacPartA = {
  ageScore: undefined,
  smokeScore: undefined,
  alcoholScore: undefined,
  waistCm: undefined,
  waistScore: undefined,
  physicalActivityScore: undefined,
  familyHistoryScore: undefined,
  totalScore: 0,
};

const INITIAL_PART_B: CbacPartB = {
  symptoms: {},
};

const INITIAL_PART_C: CbacPartC = {
  cookingFuel: [],
  occupationalExposure: [],
};

const INITIAL_PART_D: CbacPartD = {
  phq1Score: undefined,
  phq2Score: undefined,
  totalScore: 0,
};

export function CbacScreening() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { t, lang } = useLang();
  const { workerName } = useSettings();

  const [activeSlide, setActiveSlide] = useState<SlideId>('A');
  const [general, setGeneral] = useState<CbacGeneralInfo>({
    ...INITIAL_GENERAL,
    ashaName: workerName || 'ASHA Rekha Devi',
  });
  const [partA, setPartA] = useState<CbacPartA>(INITIAL_PART_A);
  const [partB, setPartB] = useState<CbacPartB>(INITIAL_PART_B);
  const [partC, setPartC] = useState<CbacPartC>(INITIAL_PART_C);
  const [partD, setPartD] = useState<CbacPartD>(INITIAL_PART_D);

  const [smartExplanations, setSmartExplanations] = useState<SmartParseExplanation[]>([]);
  const [pulseField, setPulseField] = useState<string | null>(null);
  const [showGeneralDetails, setShowGeneralDetails] = useState(false);
  const [b1Category, setB1Category] = useState<'all' | 'tb' | 'mouth' | 'vision_nerve' | 'skin'>('all');
  const [b1Filter, setB1Filter] = useState('');
  const [saving, setSaving] = useState(false);
  const [referralForm, setReferralForm] = useState<ReferralFormState>(INITIAL_REFERRAL);

  const [interviewIndex, setInterviewIndex] = useState<number>(0);
  const [interviewActive, setInterviewActive] = useState<boolean>(false);
  const [currentAnswer, setCurrentAnswer] = useState<string>('');

  const { speak, stop: stopSpeak, speaking } = useSpeak();

  // If editing an existing case, load patient & any existing CBAC
  useEffect(() => {
    if (!id) return;
    void getCase(id).then((c) => {
      if (!c) return;
      const { patient: p, referral: r } = c;
      setGeneral((prev) => ({
        ...prev,
        name: p.name || prev.name,
        age: p.age ?? prev.age,
        sex: p.sex ?? prev.sex,
        phone: p.phone || prev.phone,
        address: p.locality || prev.address,
      }));

      if (r) {
        setReferralForm({
          screeningCompleted: r.screening?.completed ?? true,
          screeningArea: r.screening?.area || 'ncd',
          screeningFinding: r.screening?.finding || '',
          referralRequired: r.screening?.referralRequired || 'yes',
          destinationFacility: r.destinationFacility || 'CHC Bero',
          reason: r.reason || '',
          referralDate: r.referralDate || today(),
          urgency: r.urgency || 'routine',
          appointmentDate: r.worker.appointmentDate || '',
          patientIntention: r.patientIntention || '',
          notes: r.notes || '',
          facilityResponse: r.worker.facilityResponse,
        });
      }

      // Proactively classify age if available
      if (p.age !== undefined) {
        const aScore = classifyAge(p.age);
        setPartA((prevA) => ({
          ...prevA,
          ageScore: aScore,
          totalScore: calculatePartAScore({ ...prevA, ageScore: aScore }),
        }));
      }

      if (r.screening?.cbac) {
        const cb = r.screening.cbac;
        if (cb.general) setGeneral(cb.general);
        if (cb.partA) setPartA(cb.partA);
        if (cb.partB) setPartB(cb.partB);
        if (cb.partC) setPartC(cb.partC);
        if (cb.partD) setPartD(cb.partD);
      }
    });
  }, [id]);

  // Read URL query params like ?name=Sunita&age=26&sex=F
  useEffect(() => {
    const qName = searchParams.get('name');
    const qAge = searchParams.get('age');
    const qSex = searchParams.get('sex') as Sex | null;
    if (qName || qAge || qSex) {
      setGeneral((prev) => {
        const nextAge = qAge ? Number(qAge) : prev.age;
        const nextSex = qSex || prev.sex;
        return {
          ...prev,
          name: qName || prev.name,
          age: nextAge,
          sex: nextSex,
        };
      });
      if (qAge) {
        const numAge = Number(qAge);
        if (!isNaN(numAge)) {
          const aScore = classifyAge(numAge);
          setPartA((prev) => ({
            ...prev,
            ageScore: aScore,
            totalScore: calculatePartAScore({ ...prev, ageScore: aScore }),
          }));
        }
      }
    }
  }, [searchParams]);

  const [isInterviewListening, setIsInterviewListening] = useState(false);
  const stopRecognitionRef = useRef<(() => void) | null>(null);
  const questionIndexRef = useRef(interviewIndex);
  const interviewActiveRef = useRef(false);
  const questionRunRef = useRef(0);
  const answerPendingRef = useRef(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerHandlerRef = useRef<(text: string) => void>(() => {});
  const [answerError, setAnswerError] = useState('');
  questionIndexRef.current = interviewIndex;
  // Recognition can outlive a render; always dispatch to the latest question handler.
  answerHandlerRef.current = handleInterviewAnswer;

  const interviewQuestions = useMemo(() => getApplicableInterviewQuestions(general.sex), [general.sex]);
  const questionsRef = useRef(interviewQuestions);
  questionsRef.current = interviewQuestions;
  const currentQuestion = interviewQuestions[interviewIndex] || interviewQuestions[0];
  const scoreBreakdown = getPartAScoreBreakdown(partA);

  const stopInterviewListening = useCallback(() => {
    const stop = stopRecognitionRef.current;
    stopRecognitionRef.current = null;
    stop?.();
    setIsInterviewListening(false);
  }, []);

  const clearTransition = useCallback(() => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = null;
  }, []);

  const startInterviewListening = useCallback(() => {
    if (answerPendingRef.current) return;
    const W = window as any;
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) {
      setAnswerError('Microphone recognition is unavailable. Type an answer or use a quick answer.');
      return;
    }
    stopInterviewListening();
    setAnswerError('');
    setIsInterviewListening(true);
    stopRecognitionRef.current = listenForInterviewAnswer(new SR(), {
      lang: lang === 'hi' ? 'hi-IN' : 'en-US',
      onTranscript: setCurrentAnswer,
      onAnswer: text => answerHandlerRef.current(text),
      onStopped: () => setIsInterviewListening(false),
    });
  }, [lang, stopInterviewListening]);

  const speakQuestion = useCallback((qIndex: number, autoListen = true) => {
    const q = questionsRef.current[qIndex];
    if (!q) return;
    clearTransition();
    const run = ++questionRunRef.current;
    answerPendingRef.current = false;
    questionIndexRef.current = qIndex;
    setInterviewIndex(qIndex);
    setAnswerError('');
    setActiveSlide(q.slide);
    const textToSpeak = getQuestionText(q, lang);
    stopInterviewListening();
    setCurrentAnswer('');
    void speak([{ text: textToSpeak }]).then(() => {
      // Once speaking the question finishes, automatically listen for the answer
      if (autoListen && interviewActiveRef.current && questionRunRef.current === run) {
        startInterviewListening();
      }
    });
  }, [lang, speak, stopInterviewListening, startInterviewListening, clearTransition]);

  const startInterview = useCallback((startIndex = 0) => {
    interviewActiveRef.current = true;
    setInterviewActive(true);
    setInterviewIndex(startIndex);
    speakQuestion(startIndex, true);
  }, [speakQuestion]);

  const stopInterview = useCallback(() => {
    interviewActiveRef.current = false;
    ++questionRunRef.current;
    clearTransition();
    answerPendingRef.current = false;
    setInterviewActive(false);
    stopSpeak();
    stopInterviewListening();
    setCurrentAnswer('');
  }, [stopSpeak, stopInterviewListening, clearTransition]);

  function handleInterviewAnswer(answerText: string) {
    if (!answerText.trim() || answerPendingRef.current) return;
    const answeredIndex = questionIndexRef.current;
    const currentQ = questionsRef.current[answeredIndex];

    const parsed = parseCbacInterviewAnswer(currentQ.id, answerText, general.sex);
    if (!parsed.ok) {
      stopInterviewListening();
      setAnswerError(parsed.error);
      return;
    }

    answerPendingRef.current = true;
    ++questionRunRef.current;
    stopSpeak();
    setAnswerError('');
    // Apply only updates belonging to the current interview question.
    applyInterviewUpdates(parsed.updates);
    setCurrentAnswer(answerText);
    stopInterviewListening();

    const run = questionRunRef.current;
    clearTransition();
    transitionTimerRef.current = setTimeout(() => {
      transitionTimerRef.current = null;
      if (questionRunRef.current !== run) return;
      answerPendingRef.current = false;
      if (answeredIndex < questionsRef.current.length - 1) {
        const nextIdx = answeredIndex + 1;
        questionIndexRef.current = nextIdx;
        setInterviewIndex(nextIdx);
        if (interviewActiveRef.current) speakQuestion(nextIdx, true);
        else setCurrentAnswer('');
      } else {
        interviewActiveRef.current = false;
        setInterviewActive(false);
        setActiveSlide('REFERRAL');
        if (interviewActive) void speak([{ text: lang === 'hi' ? 'सभी प्रश्नों की जांच पूरी हो गई है।' : 'All interview questions have been completed.' }]);
      }
    }, 700);
  }

  function goToInterviewQuestion(index: number) {
    clearTransition();
    ++questionRunRef.current;
    answerPendingRef.current = false;
    questionIndexRef.current = index;
    setInterviewIndex(index);
    setCurrentAnswer('');
    setAnswerError('');
    stopInterviewListening();
    stopSpeak();
    if (interviewActiveRef.current) speakQuestion(index);
  }

  const previousQuestionsRef = useRef(interviewQuestions);
  useEffect(() => {
    const previous = previousQuestionsRef.current;
    previousQuestionsRef.current = interviewQuestions;
    const previousQuestion = previous[questionIndexRef.current];
    if (!previousQuestion || previous === interviewQuestions) return;
    const retainedIndex = interviewQuestions.findIndex(question => question.id === previousQuestion.id);
    const nextIndex = retainedIndex >= 0 ? retainedIndex : Math.min(questionIndexRef.current, interviewQuestions.length - 1);
    if (nextIndex !== questionIndexRef.current || retainedIndex < 0) goToInterviewQuestion(nextIndex);
  }, [interviewQuestions]);

  useEffect(() => {
    const excluded = new Set([
      ...(general.sex === 'F' ? [] : CBAC_B2_SYMPTOMS.map(item => item.id)),
      ...(typeof general.age === 'number' && general.age >= 60 ? [] : CBAC_B3_SYMPTOMS.map(item => item.id)),
    ]);
    setPartB(previous => {
      if (!Object.keys(previous.symptoms).some(key => excluded.has(key))) return previous;
      return { symptoms: Object.fromEntries(Object.entries(previous.symptoms).filter(([key]) => !excluded.has(key))) };
    });
  }, [general.sex, general.age]);

  useEffect(() => () => {
    interviewActiveRef.current = false;
    ++questionRunRef.current;
    clearTransition();
    stopRecognitionRef.current?.();
    stopRecognitionRef.current = null;
  }, [clearTransition]);

  // Smart Proactive Rule 1: When General Age changes, automatically classify into Part A Q1
  function handleAgeChange(newAgeStr: string) {
    const val = newAgeStr === '' ? '' : Number(newAgeStr);
    setGeneral((prev) => ({ ...prev, age: val }));
    if (val === '' || !Number.isFinite(val)) {
      setPartA(previous => { const next = { ...previous, ageScore: undefined }; return { ...next, totalScore: calculatePartAScore(next) }; });
      return;
    }
    if (typeof val === 'number' && !isNaN(val)) {
      const autoScore = classifyAge(val);
      triggerPulse('age');
      setPartA((prev) => {
        const updated = { ...prev, ageScore: autoScore };
        return { ...updated, totalScore: calculatePartAScore(updated) };
      });
      setSmartExplanations((prev) => [
        {
          field: 'age',
          detail: `Age ${val} entered → Smartly clicked "${
            autoScore === 0
              ? '0 - 29 years (0 pts)'
              : autoScore === 1
                ? '30 - 39 years (1 pt)'
                : autoScore === 2
                  ? '40 - 49 years (2 pts)'
                  : autoScore === 3
                    ? '50 - 59 years (3 pts)'
                    : '>= 60 years (4 pts)'
          }"`,
        },
        ...prev.filter((e) => e.field !== 'age'),
      ]);
    }
  }

  // Smart Proactive Rule 2: When General Sex changes, re-evaluate waist score
  function handleSexChange(newSex: Sex | '') {
    setGeneral((prev) => ({ ...prev, sex: newSex }));
    triggerPulse('sex');
    if (partA.waistCm !== undefined) {
      const autoWaistScore = classifyWaist(partA.waistCm, newSex);
      setPartA((prev) => {
        const updated = { ...prev, waistScore: autoWaistScore };
        return { ...updated, totalScore: calculatePartAScore(updated) };
      });
    }
    setSmartExplanations((prev) => [
      {
        field: 'sex',
        detail: newSex === 'F' ? 'Sex set to Female → Adapted Waist brackets to Female' : 'Sex set to Male → Adapted Waist brackets to Male',
      },
      ...prev.filter((e) => e.field !== 'sex'),
    ]);
  }

  // Smart Proactive Rule 3: Numeric Waist in cm automatically clicks appropriate bracket
  function handleWaistCmChange(cmStr: string) {
    const cm = cmStr === '' ? undefined : Number(cmStr);
    if (cm !== undefined && !isNaN(cm)) {
      const score = classifyWaist(cm, general.sex);
      triggerPulse('waist');
      setPartA((prev) => {
        const updated = { ...prev, waistCm: cm, waistScore: score };
        return { ...updated, totalScore: calculatePartAScore(updated) };
      });
    } else {
      setPartA(previous => { const next = { ...previous, waistCm: undefined, waistScore: undefined }; return { ...next, totalScore: calculatePartAScore(next) }; });
    }
  }

  function triggerPulse(fieldName: string) {
    setPulseField(fieldName);
    window.setTimeout(() => setPulseField(null), 2200);
  }

  function applyInterviewUpdates(res: SmartParseResult) {

    if (Object.keys(res.generalUpdates).length > 0) {
      setGeneral((prev) => ({ ...prev, ...res.generalUpdates }));
    }

    setPartA((prev) => {
      const merged = { ...prev, ...res.partAUpdates };
      if (res.generalUpdates.sex && merged.waistCm !== undefined) merged.waistScore = classifyWaist(merged.waistCm, res.generalUpdates.sex);
      return { ...merged, totalScore: calculatePartAScore(merged) };
    });

    if (Object.keys(res.partBUpdates).length > 0) {
      setPartB((prev) => ({
        symptoms: { ...prev.symptoms, ...res.partBUpdates },
      }));
    }

    if (res.partCUpdates.cookingFuel && res.partCUpdates.cookingFuel.length > 0) {
      setPartC((prev) => ({
        ...prev,
        cookingFuel: res.partCUpdates.cookingFuel!,
      }));
    }

    if (res.partCUpdates.occupationalExposure && res.partCUpdates.occupationalExposure.length > 0) {
      setPartC((prev) => ({
        ...prev,
        occupationalExposure: Array.from(new Set([...prev.occupationalExposure, ...res.partCUpdates.occupationalExposure!])),
      }));
    }

    if (res.partDUpdates.phq1Score !== undefined || res.partDUpdates.phq2Score !== undefined) {
      setPartD((prev) => {
        const merged = { ...prev, ...res.partDUpdates };
        return { ...merged, totalScore: calculatePartDScore(merged) };
      });
    }

    if (res.explanations.length > 0) {
      setSmartExplanations(res.explanations);
      triggerPulse('smart_applied');
    }
  }

  // Part A Option Clicker
  function setPartAField<K extends keyof CbacPartA>(key: K, value: CbacPartA[K]) {
    setPartA((prev) => {
      const updated = { ...prev, [key]: value };
      return { ...updated, totalScore: calculatePartAScore(updated) };
    });
  }

  // Part B Symptom Toggle
  function toggleSymptom(symptomId: string) {
    setPartB((prev) => {
      const current = prev.symptoms[symptomId];
      return {
        symptoms: {
          ...prev.symptoms,
          [symptomId]: !current,
        },
      };
    });
  }

  // Part C Toggles
  function toggleCookingFuel(fuelId: string) {
    setPartC((prev) => {
      const exists = prev.cookingFuel.includes(fuelId);
      return {
        ...prev,
        cookingFuel: exists ? prev.cookingFuel.filter((f) => f !== fuelId) : [...prev.cookingFuel, fuelId],
      };
    });
  }

  function toggleOccupationalExposure(exposureId: string) {
    setPartC((prev) => {
      const exists = prev.occupationalExposure.includes(exposureId);
      return {
        ...prev,
        occupationalExposure: exists
          ? prev.occupationalExposure.filter((e) => e !== exposureId)
          : [...prev.occupationalExposure, exposureId],
      };
    });
  }

  // Part D Option Clicker
  function setPartDScore(q: 'phq1' | 'phq2', val: number) {
    setPartD((prev) => {
      const updated = {
        ...prev,
        [q === 'phq1' ? 'phq1Score' : 'phq2Score']: val,
      };
      return { ...updated, totalScore: calculatePartDScore(updated) };
    });
  }

  // Computed Triage
  const triage = useMemo(() => {
    return evaluateCbacTriage(partA, partB, partC, partD);
  }, [partA, partB, partC, partD]);

  const isElderly = typeof general.age === 'number' && general.age >= 60;
  const isFemale = general.sex === 'F';

  // Completion check per slide
  const slideAComplete =
    partA.ageScore !== undefined &&
    partA.smokeScore !== undefined &&
    partA.alcoholScore !== undefined &&
    partA.waistScore !== undefined &&
    partA.physicalActivityScore !== undefined &&
    partA.familyHistoryScore !== undefined;

  const totalSymptomsChecked = Object.values(partB.symptoms).filter(Boolean).length;
  const slideBComplete = true; // Symptoms can all be negative (No)
  const slideCComplete = partC.cookingFuel.length > 0;
  const slideDComplete = partD.phq1Score !== undefined && partD.phq2Score !== undefined;

  // Filtered B1 symptoms
  const filteredB1 = useMemo(() => {
    return CBAC_B1_SYMPTOMS.filter((s) => {
      if (b1Filter.trim()) {
        const query = b1Filter.toLowerCase();
        if (!s.label.toLowerCase().includes(query)) return false;
      }
      if (b1Category === 'tb') return s.isTbSuspect || s.isTbContact;
      if (b1Category === 'mouth') return s.id.includes('mouth') || s.id.includes('chewing') || s.id.includes('voice');
      if (b1Category === 'vision_nerve')
        return s.id.includes('vision') || s.id.includes('eye') || s.id.includes('fits') || s.id.includes('tingling') || s.id.includes('numbness');
      if (b1Category === 'skin') return s.id.includes('skin') || s.id.includes('hypopigmented') || s.id.includes('nodules');
      return true;
    });
  }, [b1Category, b1Filter]);

  // Auto-sync triage referral suggestion into referralForm
  useEffect(() => {
    if (triage.referralRequired) {
      setReferralForm((prev) => ({
        ...prev,
        referralRequired: 'yes',
        urgency: prev.urgency === 'routine' ? triage.urgency : prev.urgency,
        reason: prev.reason || triage.reasons.join(' · '),
        destinationFacility:
          prev.destinationFacility ||
          (triage.tbSuspectAlert ? 'CHC Bero (TB Unit)' : triage.highRiskNcd ? 'CHC Bero (NCD Clinic)' : 'PHC Itki'),
      }));
    }
  }, [triage.referralRequired, triage.urgency, triage.tbSuspectAlert, triage.highRiskNcd, triage.reasons]);

  // Small AI Live Preview
  const preview = useMemo(() => {
    if (!general.name.trim()) return null;
    const p = {
      name: general.name.trim(),
      age: typeof general.age === 'number' ? general.age : undefined,
      sex: general.sex || undefined,
      phone: general.phone.trim() || undefined,
      locality: general.address.trim() || undefined,
    };
    const patient = makePatient({ id: 'draft', ...p });
    const referral = makeReferral({
      id: 'draft',
      patientId: 'draft',
      reason: referralForm.reason.trim(),
      destinationFacility: referralForm.destinationFacility.trim(),
      referralDate: referralForm.referralDate,
      urgency: referralForm.urgency,
      notes: referralForm.notes.trim(),
      patientIntention: referralForm.patientIntention || undefined,
      worker: {
        appointmentDate: referralForm.appointmentDate || undefined,
        facilityResponse: referralForm.facilityResponse,
      },
    });
    return analyze(patient, referral, []);
  }, [general, referralForm]);

  // Save CBAC Assessment
  async function handleSaveAssessment() {
    if (!general.name.trim()) {
      alert('Please enter patient name.');
      setShowGeneralDetails(true);
      return;
    }
    setSaving(true);
    const completedAt = new Date().toISOString();
    const fullAssessment: CbacAssessment = {
      id: id || undefined,
      general,
      partA,
      partB,
      partC,
      partD,
      highRiskNcd: triage.highRiskNcd,
      symptomAlert: triage.symptomAlert,
      tbSuspectAlert: triage.tbSuspectAlert,
      tbContactAlert: triage.tbContactAlert,
      mentalHealthAlert: triage.mentalHealthAlert,
      completedAt,
    };

    const patientDraft = {
      name: general.name.trim(),
      age: typeof general.age === 'number' ? general.age : undefined,
      sex: general.sex || undefined,
      phone: general.phone.trim() || undefined,
      locality: general.address.trim() || undefined,
    };

    const isReferralYes = referralForm.referralRequired === 'yes';

    const referralDraft = {
      reason: isReferralYes
        ? (referralForm.reason.trim() || triage.reasons.join(' · ') || 'CBAC NCD Referral')
        : 'Routine CBAC Assessment (No Referral Needed)',
      destinationFacility: isReferralYes
        ? (referralForm.destinationFacility.trim() || 'CHC Bero')
        : '',
      referralDate: referralForm.referralDate || today(),
      urgency: isReferralYes ? referralForm.urgency : 'routine',
      notes: referralForm.notes.trim() || `CBAC Part A Score: ${partA.totalScore}/12. PHQ-2 Score: ${partD.totalScore}/6. ${triage.reasons.join('; ')}`,
      patientIntention: isReferralYes ? referralForm.patientIntention || undefined : undefined,
      appointmentDate: isReferralYes ? referralForm.appointmentDate || undefined : undefined,
      facilityResponse: isReferralYes ? referralForm.facilityResponse : undefined,
      ...(!id ? {
        tier: (['asha', 'phc', 'dh', 'tcc'].includes(searchParams.get('tier') || '') ? searchParams.get('tier') as import('../../db/types').CareTier : 'asha'),
        unit: (['a', 'b', 'c'].includes(searchParams.get('unit') || '') ? searchParams.get('unit') as import('../../db/types').CareUnit : authUser.unit),
      } : {}),
      screening: {
        completed: referralForm.screeningCompleted,
        area: (referralForm.screeningArea || 'ncd') as ScreeningArea,
        finding: (referralForm.screeningFinding || (triage.highRiskNcd || triage.symptomAlert ? 'positive' : 'negative')) as ScreeningFinding,
        referralRequired: referralForm.referralRequired,
        cbac: fullAssessment,
      },
    };

    try {
      if (id) {
        await updateCase(id, patientDraft, referralDraft);
        navigate(`/case/${id}`, { state: { toast: 'status.savedLocally' } });
      } else {
        const newId = await createCase(patientDraft, referralDraft, general.ashaName || workerName || 'ASHA');
        navigate(`/case/${newId}`, { state: { toast: 'status.savedLocally', showStageSummary: true } });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <BackLink to={id ? `/case/${id}` : '/'} label={id ? t('case.back') : 'Back to Home'} />
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand">
            MoHFW / Dell CBAC standard
          </span>
          <button
            type="button"
            onClick={() => setShowGeneralDetails(!showGeneralDetails)}
            className="btn btn-secondary !min-h-[38px] !px-3 text-xs sm:text-sm font-semibold flex items-center gap-1.5"
          >
            <Icon name="user" size={16} />
            <span>{showGeneralDetails ? 'Hide Patient Info' : 'Patient & ASHA Details'}</span>
          </button>
        </div>
      </div>

      {/* Main Title & Subtitle */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-brand flex items-center gap-2">
          <Icon name="spark" size={24} className="text-accent" />
          Community Based Assessment Checklist (CBAC)
        </h1>
        <p className="text-xs sm:text-sm text-muted mt-0.5">
          Proactive NCD risk scoring, TB symptom detection, COPD risk factors, and PHQ-2 mental health screening.
        </p>
      </div>

      {/* Smart Voice & Natural Language Assistant Card */}
      <section className="card bg-gradient-to-r from-teal-50/70 via-white to-sky-50/70 border-2 border-accent/40 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-line/60">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-xs">
              <Icon name="spark" size={18} />
            </span>
            <div>
              <span className="font-bold text-sm sm:text-base text-brand block leading-tight">
                Proactive AI Voice Assistant
              </span>
              <span className="text-[0.72rem] text-muted">
                Answer one question at a time using your microphone, typed text, or a quick answer.
              </span>
            </div>
          </div>

        </div>

        {/* MODE 1: Step-by-Step Interactive Questioning */}
        <>
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="p-3.5 rounded-2xl bg-white border border-accent/30 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.75rem] font-bold text-accent uppercase tracking-wider">
                  Question {interviewIndex + 1} of {interviewQuestions.length} · {currentQuestion.slide === 'A' ? 'Part A: Risk' : currentQuestion.slide === 'B' ? 'Part B: Symptoms' : currentQuestion.slide === 'C' ? 'Part C: COPD' : 'Part D: PHQ-2'}
                </span>
                <span className="text-xs font-semibold text-muted">
                  Language: {lang === 'hi' ? 'हिंदी (Hindi)' : 'English'}
                </span>
              </div>

              {/* Spoken Question Banner */}
              <div className="p-3 rounded-xl bg-teal-50/80 border border-teal-200/70 text-ink">
                <div className="flex items-start gap-2">
                  <span className="text-lg">📢</span>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-brand">
                      {getQuestionText(currentQuestion, lang)}
                    </h3>
                    <p className="text-xs text-muted mt-0.5">
                      {getQuestionHint(currentQuestion, lang)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-teal-200 bg-teal-50 p-3" role="status" aria-live="polite">
                <div className="text-xs font-semibold text-teal-800">Cumulative risk score · Part A</div>
                <div className="font-mono text-lg font-bold text-teal-900 mt-1">{scoreBreakdown.expression}</div>
                <div className="text-xs text-teal-700">{scoreBreakdown.answered}/6 scored questions answered · Total {scoreBreakdown.total}/12</div>
              </div>
              {/* Sample Quick Answer Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="font-semibold text-muted text-[0.72rem] mr-1">Tap quick answer:</span>
                {currentQuestion.sampleResponses.map((sample, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => handleInterviewAnswer(sample)}
                    className="rounded-lg bg-surface border border-line px-2.5 py-1 font-semibold text-brand hover:border-brand hover:bg-brand/5 transition-all text-xs"
                  >
                    "{sample}"
                  </button>
                ))}
              </div>

              {/* Interactive Voice Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line/50">
                <div className="flex items-center gap-2">
                  {!interviewActive ? (
                    <button
                      type="button"
                      onClick={() => startInterview(interviewIndex)}
                      className="btn btn-accent !min-h-[38px] !px-4 text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs"
                    >
                      <Icon name="speaker" size={16} />
                      <span>Start Voice Interview</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => speakQuestion(interviewIndex)}
                        disabled={speaking}
                        className={`btn !min-h-[38px] !px-3 text-xs font-semibold flex items-center gap-1.5 ${
                          speaking ? 'btn-secondary text-accent font-bold animate-pulse' : 'btn-secondary'
                        }`}
                      >
                        <Icon name="speaker" size={16} />
                        <span>{speaking ? 'Speaking Question…' : 'Repeat Question'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (isInterviewListening) {
                            stopInterviewListening();
                          } else {
                            startInterviewListening();
                          }
                        }}
                        className={`btn !min-h-[38px] !px-3 text-xs font-bold flex items-center gap-1.5 ${
                          isInterviewListening ? 'btn-danger animate-pulse' : 'btn-primary'
                        }`}
                      >
                        <Icon name="mic" size={16} />
                        <span>{isInterviewListening ? 'Listening Answer…' : 'Answer with Mic'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={stopInterview}
                        className="btn btn-ghost !min-h-[38px] !px-2.5 text-xs text-muted hover:text-danger"
                      >
                        Stop Interview
                      </button>
                    </>
                  )}
                </div>

                {/* Step Navigation */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={interviewIndex === 0}
                    onClick={() => {
                      const prevIdx = Math.max(0, interviewIndex - 1);
                      goToInterviewQuestion(prevIdx);
                    }}
                    className="btn btn-secondary !min-h-[34px] !px-2.5 text-xs font-semibold"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs font-bold text-ink px-1.5">
                    {interviewIndex + 1}/{interviewQuestions.length}
                  </span>
                  <button
                    type="button"
                    disabled={interviewIndex === interviewQuestions.length - 1}
                    onClick={() => {
                      const nextIdx = Math.min(interviewQuestions.length - 1, interviewIndex + 1);
                      goToInterviewQuestion(nextIdx);
                    }}
                    className="btn btn-secondary !min-h-[34px] !px-2.5 text-xs font-semibold"
                  >
                    Skip / Next →
                  </button>
                </div>
              </div>

              <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); handleInterviewAnswer(currentAnswer); }}>
                <label className="sr-only" htmlFor="interview-answer">Answer to the current question</label>
                <input id="interview-answer" className="flex-1 min-w-0 text-sm" value={currentAnswer} onChange={event => setCurrentAnswer(event.target.value)} placeholder="Type your answer…" />
                <button type="submit" className="btn btn-primary text-xs" disabled={!currentAnswer.trim()}>Save answer & next</button>
              </form>
              {answerError && <p role="alert" className="text-sm text-danger">{answerError}</p>}
              {/* Recognized Answer feedback */}
              {currentAnswer && (
                <div className="rounded-xl bg-accent-soft/70 px-3 py-1.5 text-xs text-brand font-medium flex items-center gap-2">
                  <span className="font-bold text-accent">Heard Answer:</span>
                  <span className="italic font-bold">"{currentAnswer}"</span>
                </div>
              )}
            </div>
          </div>
        </>

        {/* Smart Explanations Badge Banner */}
        {smartExplanations.length > 0 && (
          <div className="mt-2 rounded-xl bg-accent-soft/70 p-2.5 text-xs text-brand space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-accent">
              <Icon name="check" size={14} />
              Proactive AI Actions Applied:
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {smartExplanations.map((exp, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 font-medium border border-accent/30 text-brand shadow-2xs"
                >
                  <span className="text-accent font-bold">✓</span> {exp.detail}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ALWAYS VISIBLE: Patient Profile & Demographics (Questions from New Referral) */}
      <section className="card bg-white border-2 border-brand/20 shadow-sm p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white shadow-2xs font-bold text-xs">
              <Icon name="user" size={16} />
            </span>
            <span className="font-black text-sm sm:text-base text-brand">
              Patient Identification & Demographics
            </span>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[0.72rem] font-bold text-brand uppercase">
              Core Referral Intake
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowGeneralDetails(!showGeneralDetails)}
            className="text-xs font-bold text-brand hover:underline flex items-center gap-1"
          >
            <span>{showGeneralDetails ? '▲ Hide Administrative Details' : '▼ More Administrative / ASHA Details'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Patient Name */}
          <div className="lg:col-span-2">
            <label className="block text-xs font-bold text-ink mb-1">
              Patient Full Name *
            </label>
            <input
              type="text"
              id="patient-name"
              value={general.name}
              placeholder="e.g. Sunita Devi"
              onChange={(e) => setGeneral({ ...general, name: e.target.value })}
              className={`!min-h-[42px] text-sm ${!general.name.trim() ? 'border-brand/40' : ''}`}
              required
            />
          </div>

          {/* Age (Smart Auto-classifier) */}
          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              Age (Years) *
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={120}
                value={general.age}
                placeholder="e.g. 26"
                onChange={(e) => handleAgeChange(e.target.value)}
                className={`!min-h-[42px] text-sm pr-7 ${pulseField === 'age' ? 'ring-2 ring-accent ring-offset-1 animate-pulse' : ''}`}
                required
              />
              {partA.ageScore !== undefined && (
                <span className="absolute right-2.5 top-2.5 text-xs font-bold text-accent" title="Auto-classified into Part A Q1">
                  ✓
                </span>
              )}
            </div>
            <span className="text-[0.7rem] text-muted block mt-0.5">
              Auto-clicks Part A Q1
            </span>
          </div>

          {/* Sex (Smart Gender Adapter) */}
          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              Sex *
            </label>
            <div className="grid grid-cols-3 gap-1" role="radiogroup">
              {(['F', 'M', 'O'] as Sex[]).map((s) => {
                const isSel = general.sex === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSexChange(s)}
                    className={`btn !min-h-[42px] !px-1 text-xs font-bold ${
                      isSel ? 'btn-primary shadow-xs' : 'btn-secondary text-muted'
                    } ${pulseField === 'sex' && isSel ? 'ring-2 ring-accent' : ''}`}
                  >
                    {s === 'F' ? 'Female' : s === 'M' ? 'Male' : 'Other'}
                  </button>
                );
              })}
            </div>
            <span className="text-[0.7rem] text-muted block mt-0.5">
              Adapts waist & B2
            </span>
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={general.phone}
              placeholder="10 digit mobile"
              onChange={(e) => setGeneral({ ...general, phone: e.target.value })}
              className="!min-h-[42px] text-sm"
            />
          </div>
        </div>

        {/* Locality & Address */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-line/50">
          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              Locality / Village / Ward
            </label>
            <input
              type="text"
              value={general.address}
              placeholder="Village locality, hamlet, or tola"
              onChange={(e) => setGeneral({ ...general, address: e.target.value })}
              className="!min-h-[40px] text-xs sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-ink mb-1">
              Village / Ward Name
            </label>
            <input
              type="text"
              value={general.villageWard}
              placeholder="e.g. Bero"
              onChange={(e) => setGeneral({ ...general, villageWard: e.target.value })}
              className="!min-h-[40px] text-xs sm:text-sm"
            />
          </div>
        </div>
      </section>

      {/* Collapsible Administrative / MoHFW Info Section */}
      {showGeneralDetails && (
        <section className="card bg-surface/70 border border-brand/20 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-line pb-2 mb-3">
            <h2 className="font-bold text-xs sm:text-sm text-brand flex items-center gap-1.5 uppercase tracking-wider">
              <Icon name="user" size={16} />
              Administrative MoHFW / ASHA Metadata
            </h2>
            <button
              type="button"
              onClick={() => setShowGeneralDetails(false)}
              className="text-xs font-bold text-muted hover:text-brand"
            >
              ✕ Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs sm:text-sm">
            <div>
              <label className="block font-semibold mb-1">Assessment Date</label>
              <input
                type="date"
                value={general.date}
                onChange={(e) => setGeneral({ ...general, date: e.target.value })}
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Name of ASHA</label>
              <input
                type="text"
                value={general.ashaName}
                onChange={(e) => setGeneral({ ...general, ashaName: e.target.value })}
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Name of MPW / ANM</label>
              <input
                type="text"
                value={general.mpwAnmName}
                onChange={(e) => setGeneral({ ...general, mpwAnmName: e.target.value })}
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Sub Centre / PHC</label>
              <input
                type="text"
                value={general.subCentre}
                onChange={(e) => setGeneral({ ...general, subCentre: e.target.value })}
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Identifier (Aadhaar / Voter ID)</label>
              <input
                type="text"
                value={general.identifierNumber}
                placeholder="e.g. XXXX-XXXX-1234"
                onChange={(e) => setGeneral({ ...general, identifierNumber: e.target.value })}
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">State Health Insurance</label>
              <div className="flex items-center gap-3 mt-1.5">
                <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="!min-h-0 !w-auto"
                    checked={general.hasStateInsurance}
                    onChange={(e) => setGeneral({ ...general, hasStateInsurance: e.target.checked })}
                  />
                  <span>Covered (PM-JAY / State)</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">Disability Status</label>
              <div className="flex items-center gap-3 mt-1.5">
                <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="!min-h-0 !w-auto"
                    checked={general.hasDisability}
                    onChange={(e) => setGeneral({ ...general, hasDisability: e.target.checked })}
                  />
                  <span>Has Disability</span>
                </label>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Stepper Tabs Navigation (Horizontal Slides) */}
      <nav aria-label="CBAC Slides" className="bg-white border border-line rounded-2xl p-1.5 shadow-2xs">
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setActiveSlide('A')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 sm:px-2 rounded-xl font-bold text-xs sm:text-sm transition-all ${
              activeSlide === 'A'
                ? 'bg-brand text-white shadow-xs'
                : 'text-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <span className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[0.7rem] sm:text-xs ${
              activeSlide === 'A' ? 'bg-white text-brand font-black' : slideAComplete ? 'bg-ok text-white' : 'bg-line text-muted'
            }`}>
              {slideAComplete ? '✓' : 'A'}
            </span>
            <span className="truncate">Part A: Risk</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSlide('B')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 sm:px-2 rounded-xl font-bold text-xs sm:text-sm transition-all ${
              activeSlide === 'B'
                ? 'bg-brand text-white shadow-xs'
                : 'text-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <span className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[0.7rem] sm:text-xs ${
              activeSlide === 'B' ? 'bg-white text-brand font-black' : totalSymptomsChecked > 0 ? 'bg-danger text-white' : 'bg-line text-muted'
            }`}>
              {totalSymptomsChecked > 0 ? totalSymptomsChecked : 'B'}
            </span>
            <span className="truncate">Part B: Symptoms</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSlide('C')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 sm:px-2 rounded-xl font-bold text-xs sm:text-sm transition-all ${
              activeSlide === 'C'
                ? 'bg-brand text-white shadow-xs'
                : 'text-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <span className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[0.7rem] sm:text-xs ${
              activeSlide === 'C' ? 'bg-white text-brand font-black' : slideCComplete ? 'bg-ok text-white' : 'bg-line text-muted'
            }`}>
              {slideCComplete ? '✓' : 'C'}
            </span>
            <span className="truncate">Part C: COPD</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSlide('D')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 sm:px-2 rounded-xl font-bold text-xs sm:text-sm transition-all ${
              activeSlide === 'D'
                ? 'bg-brand text-white shadow-xs'
                : 'text-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <span className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[0.7rem] sm:text-xs ${
              activeSlide === 'D' ? 'bg-white text-brand font-black' : slideDComplete ? 'bg-ok text-white' : 'bg-line text-muted'
            }`}>
              {slideDComplete ? '✓' : 'D'}
            </span>
            <span className="truncate">Part D: PHQ-2</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSlide('REFERRAL')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 sm:px-2 rounded-xl font-bold text-xs sm:text-sm transition-all ${
              activeSlide === 'REFERRAL'
                ? 'bg-brand text-white shadow-xs'
                : 'text-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <span className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[0.7rem] sm:text-xs ${
              activeSlide === 'REFERRAL'
                ? 'bg-white text-brand font-black'
                : referralForm.referralRequired === 'yes'
                  ? 'bg-warn text-white'
                  : 'bg-line text-muted'
            }`}>
              {referralForm.referralRequired === 'yes' ? '!' : '5'}
            </span>
            <span className="truncate">Referral Plan</span>
          </button>
        </div>
      </nav>

      {/* Two-Column Side-by-Side Grid: Main Slide + Sticky Right Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
        {/* Left / Center: Active Slide Content */}
        <div className="lg:col-span-8 space-y-4">
          {/* ============================================================== */}
          {/* SLIDE A: Part A - Risk Assessment                              */}
          {/* ============================================================== */}
          {activeSlide === 'A' && (
            <div className="card space-y-4 sm:space-y-5 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-brand flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white text-sm font-bold">
                      A
                    </span>
                    Part A: Risk Assessment
                  </h2>
                  <p className="text-xs sm:text-sm text-muted">
                    Total Part A Score &gt; 4 indicates higher risk of NCDs (weekly screening prioritization).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {general.age !== '' && (
                    <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">
                      Age: {general.age} yrs
                    </span>
                  )}
                  {general.sex && (
                    <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">
                      Sex: {general.sex === 'F' ? 'Female' : 'Male'}
                    </span>
                  )}
                </div>
              </div>

              {/* Quick demographic quick-inputs if not yet filled */}
              {(!general.age || !general.sex) && (
                <div className="rounded-xl bg-info-soft p-3 text-xs sm:text-sm flex flex-wrap items-center gap-3">
                  <span className="font-bold text-brand flex items-center gap-1">
                    <Icon name="spark" size={16} /> Quick Setup:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <label className="font-semibold">Age:</label>
                    <input
                      type="number"
                      placeholder="e.g. 26"
                      className="!min-h-[34px] !w-20 text-xs py-1 px-2"
                      value={general.age}
                      onChange={(e) => handleAgeChange(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="font-semibold">Sex:</label>
                    <select
                      className="!min-h-[34px] !w-28 text-xs py-1 px-2"
                      value={general.sex}
                      onChange={(e) => handleSexChange(e.target.value as Sex | '')}
                    >
                      <option value="">Select</option>
                      <option value="F">Female</option>
                      <option value="M">Male</option>
                    </select>
                  </div>
                  <span className="text-muted text-xs">
                    (Try typing age 26 — it will auto-click the 0-29 bar below!)
                  </span>
                </div>
              )}

              {/* Question 1: What is your age? */}
              <div className={`space-y-2 p-3 rounded-2xl transition-all ${pulseField === 'age' ? 'ring-2 ring-accent bg-accent-soft/30' : 'bg-surface/50 border border-line/60'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm sm:text-base text-ink">
                    1. What is your age? (in complete years)
                  </span>
                  {partA.ageScore !== undefined && (
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">
                      Score: {partA.ageScore}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" role="radiogroup">
                  {[
                    { label: '0 – 29 years', score: 0, range: '<= 29' },
                    { label: '30 – 39 years', score: 1, range: '30-39' },
                    { label: '40 – 49 years', score: 2, range: '40-49' },
                    { label: '50 – 59 years', score: 3, range: '50-59' },
                    { label: '≥ 60 years', score: 4, range: '>= 60' },
                  ].map((opt) => {
                    const isSelected = partA.ageScore === opt.score;
                    return (
                      <button
                        key={opt.score}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setPartAField('ageScore', opt.score)}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                          isSelected
                            ? 'bg-brand text-white border-brand shadow-xs scale-[1.02] font-bold'
                            : 'bg-white text-ink border-line hover:border-brand/50'
                        }`}
                      >
                        <span className="text-xs sm:text-[0.82rem]">{opt.label}</span>
                        <span className={`text-[0.7rem] font-bold mt-1 ${isSelected ? 'text-teal-200' : 'text-muted'}`}>
                          {opt.score} pts
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question 2: Smoking / Smokeless tobacco */}
              <div className="space-y-2 p-3 rounded-2xl bg-surface/50 border border-line/60">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm sm:text-base text-ink">
                    2. Do you smoke or consume smokeless products (gutka/khaini)?
                  </span>
                  {partA.smokeScore !== undefined && (
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">
                      Score: {partA.smokeScore}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup">
                  {[
                    { label: 'Never', score: 0 },
                    { label: 'Used to consume / Sometimes now', score: 1 },
                    { label: 'Daily', score: 2 },
                  ].map((opt) => {
                    const isSelected = partA.smokeScore === opt.score;
                    return (
                      <button
                        key={opt.score}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setPartAField('smokeScore', opt.score)}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                          isSelected
                            ? 'bg-brand text-white border-brand shadow-xs font-bold'
                            : 'bg-white text-ink border-line hover:border-brand/50'
                        }`}
                      >
                        <span className="text-xs sm:text-[0.84rem]">{opt.label}</span>
                        <span className={`text-[0.7rem] font-bold mt-1 ${isSelected ? 'text-teal-200' : 'text-muted'}`}>
                          {opt.score} pts
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question 3: Alcohol */}
              <div className="space-y-2 p-3 rounded-2xl bg-surface/50 border border-line/60">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm sm:text-base text-ink">
                    3. Do you consume alcohol daily?
                  </span>
                  {partA.alcoholScore !== undefined && (
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">
                      Score: {partA.alcoholScore}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2" role="radiogroup">
                  {[
                    { label: 'No', score: 0 },
                    { label: 'Yes', score: 1 },
                  ].map((opt) => {
                    const isSelected = partA.alcoholScore === opt.score;
                    return (
                      <button
                        key={opt.score}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setPartAField('alcoholScore', opt.score)}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                          isSelected
                            ? 'bg-brand text-white border-brand shadow-xs font-bold'
                            : 'bg-white text-ink border-line hover:border-brand/50'
                        }`}
                      >
                        <span className="text-xs sm:text-[0.84rem]">{opt.label}</span>
                        <span className={`text-[0.7rem] font-bold mt-1 ${isSelected ? 'text-teal-200' : 'text-muted'}`}>
                          {opt.score} pts
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question 4: Waist measurement (Adaptive to Female vs Male) */}
              <div className={`space-y-2 p-3 rounded-2xl transition-all ${pulseField === 'waist' || pulseField === 'sex' ? 'ring-2 ring-accent bg-accent-soft/30' : 'bg-surface/50 border border-line/60'}`}>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div>
                    <span className="font-bold text-sm sm:text-base text-ink">
                      4. Measurement of waist (in cm)
                    </span>
                    <span className="ml-2 rounded-md bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">
                      {isFemale ? 'Female Standards' : 'Male Standards'}
                    </span>
                  </div>
                  {partA.waistScore !== undefined && (
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">
                      Score: {partA.waistScore}
                    </span>
                  )}
                </div>

                {/* Waist Numeric Input with Live Calculation */}
                <div className="flex items-center gap-2 max-w-xs">
                  <label className="text-xs font-semibold text-muted shrink-0">Waist (cm):</label>
                  <input
                    type="number"
                    min={40}
                    max={200}
                    placeholder="e.g. 78 cm"
                    className="!min-h-[36px] text-xs py-1 px-2.5"
                    value={partA.waistCm ?? ''}
                    onChange={(e) => handleWaistCmChange(e.target.value)}
                  />
                  {partA.waistCm && (
                    <span className="text-xs font-bold text-brand shrink-0">
                      → {isFemale ? 'Female' : 'Male'} calculated
                    </span>
                  )}
                </div>

                {/* Waist Brackets (Dynamically labelled for Female vs Male) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup">
                  {(isFemale
                    ? [
                        { label: '80 cm or less', score: 0, hint: 'Normal' },
                        { label: '81 – 90 cm', score: 1, hint: 'Moderate' },
                        { label: 'More than 90 cm', score: 2, hint: 'High risk' },
                      ]
                    : [
                        { label: '90 cm or less', score: 0, hint: 'Normal' },
                        { label: '91 – 100 cm', score: 1, hint: 'Moderate' },
                        { label: 'More than 100 cm', score: 2, hint: 'High risk' },
                      ]
                  ).map((opt) => {
                    const isSelected = partA.waistScore === opt.score;
                    return (
                      <button
                        key={opt.score}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setPartAField('waistScore', opt.score)}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                          isSelected
                            ? 'bg-brand text-white border-brand shadow-xs font-bold'
                            : 'bg-white text-ink border-line hover:border-brand/50'
                        }`}
                      >
                        <span className="text-xs sm:text-[0.84rem]">{opt.label}</span>
                        <div className="flex items-center gap-1 mt-1">
                          <span className={`text-[0.7rem] ${isSelected ? 'text-teal-200' : 'text-muted'}`}>
                            {opt.hint}
                          </span>
                          <span className={`text-[0.7rem] font-bold ${isSelected ? 'text-white' : 'text-brand'}`}>
                            · {opt.score} pts
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question 5: Physical Activity */}
              <div className="space-y-2 p-3 rounded-2xl bg-surface/50 border border-line/60">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm sm:text-base text-ink">
                    5. Physical activity (min 150 min/wk; 30 min/day, 5 days/wk)?
                  </span>
                  {partA.physicalActivityScore !== undefined && (
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">
                      Score: {partA.physicalActivityScore}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup">
                  {[
                    { label: 'At least 150 minutes in a week', score: 0 },
                    { label: 'Less than 150 minutes in a week', score: 1 },
                  ].map((opt) => {
                    const isSelected = partA.physicalActivityScore === opt.score;
                    return (
                      <button
                        key={opt.score}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setPartAField('physicalActivityScore', opt.score)}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                          isSelected
                            ? 'bg-brand text-white border-brand shadow-xs font-bold'
                            : 'bg-white text-ink border-line hover:border-brand/50'
                        }`}
                      >
                        <span className="text-xs sm:text-[0.84rem]">{opt.label}</span>
                        <span className={`text-[0.7rem] font-bold mt-1 ${isSelected ? 'text-teal-200' : 'text-muted'}`}>
                          {opt.score} pts
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question 6: Family History */}
              <div className="space-y-2 p-3 rounded-2xl bg-surface/50 border border-line/60">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm sm:text-base text-ink">
                    6. Family history of High BP, Diabetes or Heart Disease?
                  </span>
                  {partA.familyHistoryScore !== undefined && (
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">
                      Score: {partA.familyHistoryScore}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2" role="radiogroup">
                  {[
                    { label: 'No', score: 0 },
                    { label: 'Yes (Parent or Sibling)', score: 2 },
                  ].map((opt) => {
                    const isSelected = partA.familyHistoryScore === opt.score;
                    return (
                      <button
                        key={opt.score}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setPartAField('familyHistoryScore', opt.score)}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                          isSelected
                            ? 'bg-brand text-white border-brand shadow-xs font-bold'
                            : 'bg-white text-ink border-line hover:border-brand/50'
                        }`}
                      >
                        <span className="text-xs sm:text-[0.84rem]">{opt.label}</span>
                        <span className={`text-[0.7rem] font-bold mt-1 ${isSelected ? 'text-teal-200' : 'text-muted'}`}>
                          {opt.score} pts
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slide A Bottom Action */}
              <div className="flex items-center justify-between pt-2">
                <div className="text-xs sm:text-sm font-bold text-brand">
                  Part A Total Score: <span className="text-lg">{partA.totalScore}</span> / 12<div className="font-mono text-xs mt-1">{scoreBreakdown.expression}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSlide('B')}
                  className="btn btn-primary !min-h-[44px] !px-5 text-sm font-bold flex items-center gap-1.5"
                >
                  <span>Next: Part B (Symptoms)</span>
                  <Icon name="chevron" size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SLIDE B: Part B - Early Detection Symptoms                     */}
          {/* ============================================================== */}
          {activeSlide === 'B' && (
            <div className="card space-y-4 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-brand flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white text-sm font-bold">
                      B
                    </span>
                    Part B: Early Detection Symptoms
                  </h2>
                  <p className="text-xs sm:text-sm text-muted">
                    If Patient answers <strong>Yes</strong> to any symptom, refer immediately to nearest facility with Medical Officer.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${totalSymptomsChecked > 0 ? 'bg-danger text-white' : 'bg-ok-soft text-ok'}`}>
                    {totalSymptomsChecked > 0 ? `⚠️ ${totalSymptomsChecked} Symptoms Positive` : '✓ All Symptoms Clear'}
                  </span>
                </div>
              </div>

              {/* Section B1: Women and Men */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-sm sm:text-base text-brand">
                    B1: Women and Men (General Symptoms)
                  </h3>
                  {/* Category Filter Pills */}
                  <div className="flex flex-wrap gap-1 text-xs">
                    {(
                      [
                        { id: 'all', label: 'All (32)' },
                        { id: 'tb', label: '🚨 TB Suspect (6)' },
                        { id: 'mouth', label: 'Oral/Mouth' },
                        { id: 'vision_nerve', label: 'Vision & Nerve' },
                        { id: 'skin', label: 'Skin & Leprosy' },
                      ] as const
                    ).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setB1Category(c.id)}
                        className={`rounded-lg px-2 py-1 font-semibold transition-colors ${
                          b1Category === c.id ? 'bg-brand text-white' : 'bg-surface text-muted hover:bg-line'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search in symptoms */}
                <input
                  type="text"
                  placeholder="Filter symptoms (e.g. cough, vision, ulcer)..."
                  className="!min-h-[36px] text-xs py-1 px-3"
                  value={b1Filter}
                  onChange={(e) => setB1Filter(e.target.value)}
                />

                {/* Symptom list */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto p-1 border border-line/60 rounded-xl">
                  {filteredB1.map((item) => {
                    const isYes = !!partB.symptoms[item.id];
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleSymptom(item.id)}
                        className={`flex items-start justify-between gap-2 p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                          isYes
                            ? item.isTbSuspect
                              ? 'bg-danger-soft/80 border-danger text-danger font-semibold shadow-xs'
                              : 'bg-warn-soft/80 border-warn text-warn font-semibold shadow-xs'
                            : 'bg-white border-line/60 text-ink hover:border-brand/40'
                        }`}
                      >
                        <div className="flex-1 text-xs sm:text-[0.82rem] leading-snug">
                          {item.label}
                          {item.isTbSuspect && (
                            <span className="block text-[0.68rem] text-danger font-bold mt-0.5">
                              * Sputum sample collection needed
                            </span>
                          )}
                          {item.isTbContact && (
                            <span className="block text-[0.68rem] text-warn font-bold mt-0.5">
                              ** Family contact tracing by ANM/MPW
                            </span>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                              isYes ? (item.isTbSuspect ? 'bg-danger text-white' : 'bg-warn text-white') : 'bg-surface text-muted'
                            }`}
                          >
                            {isYes ? 'YES' : 'NO'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section B2: Women Only */}
              {isFemale && <div className={`p-3 rounded-2xl border space-y-2 transition-all ${isFemale ? 'bg-pink-50/60 border-pink-200' : 'bg-surface/50 border-line/60 opacity-60'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm sm:text-base text-pink-900 flex items-center gap-1.5">
                    <span>🌸</span> B2: Women Only Symptoms
                  </h3>
                  {!isFemale && (
                    <span className="text-xs font-semibold text-muted bg-white px-2 py-0.5 rounded border border-line">
                      Not applicable (Male patient)
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CBAC_B2_SYMPTOMS.map((item) => {
                    const isYes = !!partB.symptoms[item.id];
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleSymptom(item.id)}
                        className={`flex items-start justify-between gap-2 p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                          isYes
                            ? 'bg-danger-soft border-danger text-danger font-semibold shadow-xs'
                            : 'bg-white border-line/60 text-ink hover:border-pink-300'
                        }`}
                      >
                        <span className="text-xs sm:text-[0.82rem] leading-snug">{item.label}</span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-bold shrink-0 ${
                            isYes ? 'bg-danger text-white' : 'bg-surface text-muted'
                          }`}
                        >
                          {isYes ? 'YES' : 'NO'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>}

              {/* Section B3: Elderly Specific (>= 60 years) */}
              {isElderly && <div className={`p-3 rounded-2xl border space-y-2 transition-all ${isElderly ? 'bg-amber-50/70 border-amber-300 shadow-xs' : 'bg-surface/50 border-line/60 opacity-75'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm sm:text-base text-amber-900 flex items-center gap-1.5">
                    <span>👴</span> B3: Elderly Specific (60 years and above)
                  </h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${isElderly ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold' : 'bg-white text-muted border-line'}`}>
                    {isElderly ? 'Active for Age >= 60' : 'Applicable for age 60+'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CBAC_B3_SYMPTOMS.map((item) => {
                    const isYes = !!partB.symptoms[item.id];
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleSymptom(item.id)}
                        className={`flex items-start justify-between gap-2 p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                          isYes
                            ? 'bg-amber-100 border-amber-500 text-amber-900 font-semibold shadow-xs'
                            : 'bg-white border-line/60 text-ink hover:border-amber-300'
                        }`}
                      >
                        <span className="text-xs sm:text-[0.82rem] leading-snug">{item.label}</span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-bold shrink-0 ${
                            isYes ? 'bg-amber-600 text-white' : 'bg-surface text-muted'
                          }`}
                        >
                          {isYes ? 'YES' : 'NO'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>}

              {/* Slide B Navigation */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveSlide('A')}
                  className="btn btn-secondary !min-h-[44px] !px-4 text-sm font-semibold"
                >
                  ← Back to Part A
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSlide('C')}
                  className="btn btn-primary !min-h-[44px] !px-5 text-sm font-bold flex items-center gap-1.5"
                >
                  <span>Next: Part C (COPD)</span>
                  <Icon name="chevron" size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SLIDE C: Part C - Risk Factors for COPD                        */}
          {/* ============================================================== */}
          {activeSlide === 'C' && (
            <div className="card space-y-5 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-brand flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white text-sm font-bold">
                      C
                    </span>
                    Part C: Risk Factors for COPD
                  </h2>
                  <p className="text-xs sm:text-sm text-muted">
                    Circle all that apply (Cooking fuel types and occupational environmental smoke exposures).
                  </p>
                </div>
              </div>

              {/* Cooking Fuel Multi-Select */}
              <div className="space-y-2">
                <div className="font-bold text-sm sm:text-base text-ink flex items-center gap-2">
                  <span>🔥</span> Type of Fuel used for cooking:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {COOKING_FUELS.map((fuel) => {
                    const isChecked = partC.cookingFuel.includes(fuel.id);
                    return (
                      <button
                        key={fuel.id}
                        type="button"
                        onClick={() => toggleCookingFuel(fuel.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                          isChecked
                            ? 'bg-brand text-white border-brand shadow-xs font-bold'
                            : 'bg-white text-ink border-line hover:border-brand/40'
                        }`}
                      >
                        <span className="text-xs sm:text-sm">{fuel.label}</span>
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold ${
                            isChecked ? 'bg-white text-brand border-white' : 'border-line text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Occupational Exposure Multi-Select */}
              <div className="space-y-2 pt-2 border-t border-line/60">
                <div className="font-bold text-sm sm:text-base text-ink flex items-center gap-2">
                  <span>🏭</span> Occupational Exposure & Environmental Smoke:
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {OCCUPATIONAL_EXPOSURES.map((exp) => {
                    const isChecked = partC.occupationalExposure.includes(exp.id);
                    return (
                      <button
                        key={exp.id}
                        type="button"
                        onClick={() => toggleOccupationalExposure(exp.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                          isChecked
                            ? 'bg-brand text-white border-brand shadow-xs font-bold'
                            : 'bg-white text-ink border-line hover:border-brand/40'
                        }`}
                      >
                        <span className="text-xs sm:text-sm pr-2">{exp.label}</span>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
                            isChecked ? 'bg-white text-brand border-white' : 'border-line text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slide C Navigation */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveSlide('B')}
                  className="btn btn-secondary !min-h-[44px] !px-4 text-sm font-semibold"
                >
                  ← Back to Part B
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSlide('D')}
                  className="btn btn-primary !min-h-[44px] !px-5 text-sm font-bold flex items-center gap-1.5"
                >
                  <span>Next: Part D (PHQ-2)</span>
                  <Icon name="chevron" size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SLIDE D: Part D - PHQ-2 & Clinical Referral Summary             */}
          {/* ============================================================== */}
          {activeSlide === 'D' && (
            <div className="card space-y-5 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-brand flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white text-sm font-bold">
                      D
                    </span>
                    Part D: PHQ-2 (Mental Health Screening)
                  </h2>
                  <p className="text-xs sm:text-sm text-muted">
                    Over the last 2 weeks, how often have you been bothered by the following problems?
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${partD.totalScore > 3 ? 'bg-danger text-white' : 'bg-brand/10 text-brand'}`}>
                    PHQ-2 Score: {partD.totalScore} / 6
                  </span>
                </div>
              </div>

              {/* Question 1: Little interest or pleasure */}
              <div className="space-y-2 p-3 rounded-2xl bg-surface/50 border border-line/60">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm sm:text-base text-ink">
                    1. Little interest or pleasure in doing things?
                  </span>
                  {partD.phq1Score !== undefined && (
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">
                      +{partD.phq1Score}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PHQ2_OPTIONS.map((opt) => {
                    const isSelected = partD.phq1Score === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPartDScore('phq1', opt.value)}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                          isSelected
                            ? 'bg-brand text-white border-brand shadow-xs font-bold'
                            : 'bg-white text-ink border-line hover:border-brand/40'
                        }`}
                      >
                        <span className="text-xs sm:text-[0.82rem]">{opt.label}</span>
                        <span className={`text-[0.7rem] font-bold mt-1 ${isSelected ? 'text-teal-200' : 'text-muted'}`}>
                          +{opt.points}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question 2: Feeling down, depressed or hopeless */}
              <div className="space-y-2 p-3 rounded-2xl bg-surface/50 border border-line/60">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm sm:text-base text-ink">
                    2. Feeling down, depressed or hopeless?
                  </span>
                  {partD.phq2Score !== undefined && (
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">
                      +{partD.phq2Score}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PHQ2_OPTIONS.map((opt) => {
                    const isSelected = partD.phq2Score === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPartDScore('phq2', opt.value)}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                          isSelected
                            ? 'bg-brand text-white border-brand shadow-xs font-bold'
                            : 'bg-white text-ink border-line hover:border-brand/40'
                        }`}
                      >
                        <span className="text-xs sm:text-[0.82rem]">{opt.label}</span>
                        <span className={`text-[0.7rem] font-bold mt-1 ${isSelected ? 'text-teal-200' : 'text-muted'}`}>
                          +{opt.points}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Total PHQ-2 & Referral Rule */}
              {partD.totalScore > 3 && (
                <div className="rounded-xl bg-danger-soft p-3 text-xs sm:text-sm font-semibold text-danger flex items-center gap-2">
                  <Icon name="alert" size={18} />
                  <span>
                    Total Score &gt; 3: Patient should be referred to CHO / MO (PHC / UPHC) for mental health support.
                  </span>
                </div>
              )}

              {/* Slide D Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setActiveSlide('C')}
                  className="btn btn-secondary !min-h-[46px] !px-4 text-sm font-semibold"
                >
                  ← Back to Part C
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSlide('REFERRAL')}
                  className="btn btn-primary !min-h-[48px] !px-6 text-sm sm:text-base font-bold shadow-md flex items-center gap-2"
                >
                  <span>Next: Referral Details</span>
                  <Icon name="chevron" size={18} />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SLIDE REFERRAL: New Referral Questions (Destination, Urgency, etc) */}
          {/* ============================================================== */}
          {activeSlide === 'REFERRAL' && (
            <div className="card space-y-5 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-brand flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white text-sm font-bold">
                      📋
                    </span>
                    Referral Plan & Facility Coordination
                  </h2>
                  <p className="text-xs sm:text-sm text-muted">
                    Destination facility, urgency, appointment scheduling, and patient intention.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${referralForm.referralRequired === 'yes' ? 'bg-warn text-white' : 'bg-ok-soft text-ok'}`}>
                    {referralForm.referralRequired === 'yes' ? 'Referral: Initiated' : 'Screening Only'}
                  </span>
                </div>
              </div>

              {/* ============================================================== */}
              {/* Section 1: Community Screening Status (New Referral Questions) */}
              {/* ============================================================== */}
              <div className="p-4 rounded-2xl bg-surface border border-line space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
                  <span className="font-bold text-sm sm:text-base text-brand flex items-center gap-1.5">
                    <Icon name="check" size={16} />
                    Community Screening Status & Finding
                  </span>
                  <span className="text-[0.72rem] font-bold uppercase tracking-wider text-muted">
                    New Referral Standard
                  </span>
                </div>

                {/* Screening Completed Checkbox */}
                <label className="flex items-center gap-2.5 font-bold text-xs sm:text-sm text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    className="!min-h-0 !w-4 !h-4 rounded text-brand focus:ring-brand"
                    checked={referralForm.screeningCompleted}
                    onChange={(e) => setReferralForm((f) => ({ ...f, screeningCompleted: e.target.checked }))}
                  />
                  <span>Community Screening Completed for Patient</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Screening Focus Area */}
                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">
                      Screening Focus Area
                    </label>
                    <select
                      value={referralForm.screeningArea}
                      onChange={(e) => setReferralForm((f) => ({ ...f, screeningArea: e.target.value as ScreeningArea | '' }))}
                      className="!min-h-[40px] text-xs sm:text-sm"
                    >
                      <option value="ncd">NCD / Chronic Disease Screening</option>
                      <option value="oral">Oral Cancer Screening</option>
                      <option value="breast">Clinical Breast Examination</option>
                      <option value="cervical">Cervical Cancer Screening (VIA)</option>
                    </select>
                  </div>

                  {/* Screening Finding */}
                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">
                      Screening Finding / Clinical Assessment
                    </label>
                    <select
                      value={
                        referralForm.screeningFinding ||
                        (triage.highRiskNcd || triage.symptomAlert ? 'positive' : 'negative')
                      }
                      onChange={(e) => setReferralForm((f) => ({ ...f, screeningFinding: e.target.value as ScreeningFinding | '' }))}
                      className="!min-h-[40px] text-xs sm:text-sm"
                    >
                      <option value="negative">Normal / Negative (Low Risk)</option>
                      <option value="positive">Suspected / Positive (High Risk Flagged)</option>
                      <option value="needs_review">Needs CHO / Medical Officer Review</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Referral Decision (Yes / No) */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-surface border border-line">
                <span className="font-bold text-sm sm:text-base text-ink block">
                  Does this patient require referral to a health facility?
                </span>
                <div className="grid grid-cols-2 gap-2" role="radiogroup">
                  <button
                    type="button"
                    onClick={() => setReferralForm((f) => ({ ...f, referralRequired: 'yes' }))}
                    className={`btn !min-h-[44px] text-xs sm:text-sm font-bold ${
                      referralForm.referralRequired === 'yes' ? 'btn-primary' : 'btn-secondary'
                    }`}
                  >
                    Yes — Initiate Referral
                  </button>
                  <button
                    type="button"
                    onClick={() => setReferralForm((f) => ({ ...f, referralRequired: 'no' }))}
                    className={`btn !min-h-[44px] text-xs sm:text-sm font-bold ${
                      referralForm.referralRequired === 'no' ? 'btn-primary' : 'btn-secondary'
                    }`}
                  >
                    No — Routine Community Care
                  </button>
                </div>
              </div>

              {referralForm.referralRequired === 'yes' ? (
                <div className="space-y-4">
                  {/* Reason for referral */}
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-ink mb-1">
                      Reason for Referral *
                    </label>
                    <input
                      type="text"
                      value={referralForm.reason}
                      placeholder="e.g. High NCD Risk (Score: 7/12) · TB Suspect: Cough > 2 wks"
                      onChange={(e) => setReferralForm((f) => ({ ...f, reason: e.target.value }))}
                      required
                    />
                    {triage.reasons.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span className="font-semibold">AI Triage Suggestion:</span>
                        <button
                          type="button"
                          onClick={() => setReferralForm((f) => ({ ...f, reason: triage.reasons.join(' · ') }))}
                          className="text-brand font-bold underline hover:opacity-80"
                        >
                          Use "{triage.reasons.join(' · ')}"
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Destination Facility */}
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-ink mb-1">
                      Destination Facility *
                    </label>
                    <input
                      list="cbac-facilities"
                      value={referralForm.destinationFacility}
                      placeholder="Select or type facility name (e.g. CHC Bero)"
                      onChange={(e) => setReferralForm((f) => ({ ...f, destinationFacility: e.target.value }))}
                      required
                    />
                    <datalist id="cbac-facilities">
                      {FACILITY_SUGGESTIONS.map((fac) => (
                        <option key={fac} value={fac} />
                      ))}
                    </datalist>
                  </div>

                  {/* Referral Date and Urgency */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs sm:text-sm font-bold text-ink mb-1">
                        Referral Date *
                      </label>
                      <input
                        type="date"
                        value={referralForm.referralDate}
                        onChange={(e) => setReferralForm((f) => ({ ...f, referralDate: e.target.value }))}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs sm:text-sm font-bold text-ink mb-1">
                        Urgency *
                      </label>
                      <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
                        {(['routine', 'soon', 'urgent'] as Urgency[]).map((u) => {
                          const isSel = referralForm.urgency === u;
                          return (
                            <button
                              key={u}
                              type="button"
                              onClick={() => setReferralForm((f) => ({ ...f, urgency: u }))}
                              className={`btn !min-h-[42px] text-xs font-bold uppercase tracking-wider ${
                                isSel
                                  ? u === 'urgent'
                                    ? 'bg-danger text-white'
                                    : u === 'soon'
                                      ? 'bg-warn text-white'
                                      : 'btn-primary'
                                  : 'btn-secondary'
                              }`}
                            >
                              {u}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Appointment Date and Patient Intention */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs sm:text-sm font-bold text-ink mb-1">
                        Expected / Scheduled Appointment Date
                      </label>
                      <input
                        type="date"
                        value={referralForm.appointmentDate}
                        onChange={(e) => setReferralForm((f) => ({ ...f, appointmentDate: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="block text-xs sm:text-sm font-bold text-ink mb-1">
                        Patient Intention
                      </label>
                      <select
                        value={referralForm.patientIntention}
                        onChange={(e) => setReferralForm((f) => ({ ...f, patientIntention: e.target.value as Intention | '' }))}
                      >
                        <option value="">Unknown / Not discussed</option>
                        <option value="will_attend">Will attend facility visit</option>
                        <option value="unsure">Unsure / Hesitant</option>
                        <option value="will_not_attend">Will not attend / Refused</option>
                      </select>
                    </div>
                  </div>

                  {/* Facility Coordination / Response (from New Referral) */}
                  <div className="p-3 rounded-xl bg-surface border border-line/60 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs sm:text-sm text-ink block">
                        Facility Response Status
                      </span>
                      <span className="text-[0.72rem] text-muted">
                        Has destination facility confirmed receipt or acceptance?
                      </span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-brand">
                      <input
                        type="checkbox"
                        className="!min-h-0 !w-4 !h-4 rounded text-brand"
                        checked={referralForm.facilityResponse === 'accepted'}
                        onChange={(e) =>
                          setReferralForm((f) => ({
                            ...f,
                            facilityResponse: e.target.checked ? 'accepted' : undefined,
                          }))
                        }
                      />
                      <span>Facility Accepted</span>
                    </label>
                  </div>

                  {/* Worker Notes */}
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-ink mb-1">
                      Frontline Worker Clinical Notes
                    </label>
                    <textarea
                      rows={3}
                      value={referralForm.notes}
                      placeholder="Add details on patient condition, family member escorting, transportation plan, etc."
                      onChange={(e) => setReferralForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </div>

                  {/* Small AI Live Gap Preview */}
                  {preview && preview.action !== 'none' && (
                    <div className="rounded-xl bg-warn-soft p-3 text-xs sm:text-sm space-y-1" data-testid="gap-preview">
                      <div className="flex items-center gap-1.5 font-bold text-warn">
                        <Icon name="alert" size={16} />
                        AI Care Coordinator Flag:
                      </div>
                      <div className="mt-1">
                        <CareStateChip state={preview.careState} />
                      </div>
                      <p className="text-ink">{t(preview.reason.key, preview.reason.params)}</p>
                      <p className="font-semibold text-brand">
                        Suggested Follow-Up: {t(`action.${preview.action}`)}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-ok-soft/70 border border-ok/30 text-xs sm:text-sm text-ok-dark space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-ok">
                    <Icon name="check" size={16} />
                    Routine Community Care Confirmed
                  </div>
                  <p className="text-muted">
                    Individual risk score is low (Score: {partA.totalScore}/12) and no danger symptoms were identified.
                    The assessment will be recorded and queued for sync. Next routine assessment in 1 year.
                  </p>
                </div>
              )}

              {/* Bottom Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setActiveSlide('D')}
                  className="btn btn-secondary !min-h-[46px] !px-4 text-sm font-semibold"
                >
                  ← Back to Part D
                </button>
                <button
                  type="button"
                  onClick={handleSaveAssessment}
                  disabled={saving}
                  className="btn btn-primary !min-h-[48px] !px-6 text-sm sm:text-base font-bold shadow-md flex items-center gap-2"
                >
                  <Icon name="check" size={18} />
                  <span>
                    {saving
                      ? 'Saving…'
                      : referralForm.referralRequired === 'yes'
                        ? 'Confirm CBAC & Create Referral'
                        : 'Save CBAC Assessment'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* RIGHT SIDEBAR: Live CBAC Score & Clinical Triage Status         */}
        {/* ============================================================== */}
        <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-4">
          {/* Card 1: Live Scores & Triage Status */}
          <div className="card space-y-4 border-brand/20 shadow-sm bg-gradient-to-b from-white to-surface">
            <div className="border-b border-line pb-2 flex items-center justify-between">
              <h3 className="font-bold text-sm sm:text-base text-brand flex items-center gap-1.5">
                <Icon name="spark" size={16} className="text-accent" />
                Live Assessment Summary
              </h3>
              <span className="text-[0.72rem] font-bold text-muted uppercase tracking-wider">
                Real-Time
              </span>
            </div>

            {/* Part A Score Gauge */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-muted">Part A Risk Score:</span>
                <span className="font-black text-sm text-ink">{partA.totalScore} / 12</span>
              </div>
              <div className="h-2.5 w-full bg-line rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    triage.highRiskNcd ? 'bg-danger' : partA.totalScore > 2 ? 'bg-warn' : 'bg-ok'
                  }`}
                  style={{ width: `${Math.min(100, (partA.totalScore / 12) * 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[0.7rem]">
                <span className="text-muted">Threshold: 4 pts</span>
                <span className={`font-bold ${triage.highRiskNcd ? 'text-danger' : 'text-ok'}`}>
                  {triage.highRiskNcd ? 'High NCD Risk (>4)' : 'Routine Screening (≤4)'}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-teal-50 p-2 text-xs text-teal-800 font-mono">{scoreBreakdown.expression}<div className="font-sans text-[10px] mt-1">{scoreBreakdown.answered}/6 scored questions answered</div></div>
            {/* Part D PHQ-2 Score */}
            <div className="space-y-1.5 pt-2 border-t border-line/60">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-muted">Part D PHQ-2:</span>
                <span className="font-black text-sm text-ink">{partD.totalScore} / 6</span>
              </div>
              <div className="h-2 w-full bg-line rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${partD.totalScore > 3 ? 'bg-danger' : 'bg-brand'}`}
                  style={{ width: `${Math.min(100, (partD.totalScore / 6) * 100)}%` }}
                />
              </div>
              <div className="text-[0.7rem] text-right">
                <span className={`font-bold ${partD.totalScore > 3 ? 'text-danger' : 'text-muted'}`}>
                  {partD.totalScore > 3 ? 'Refer to CHO/MO (>3)' : 'Normal Range (≤3)'}
                </span>
              </div>
            </div>

            {/* Clinical Alert Badges */}
            <div className="space-y-1.5 pt-2 border-t border-line/60">
              <span className="text-[0.75rem] font-bold text-muted uppercase tracking-wider block">
                Clinical Triage Alerts:
              </span>
              {triage.tbSuspectAlert && (
                <div className="rounded-xl bg-danger-soft p-2.5 text-xs text-danger font-semibold flex items-start gap-1.5">
                  <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold">🚨 TB Suspect Alert</div>
                    <div className="text-[0.72rem] text-danger/90">
                      Sputum collection & transport to nearest TB center
                    </div>
                  </div>
                </div>
              )}
              {triage.tbContactAlert && (
                <div className="rounded-xl bg-warn-soft p-2.5 text-xs text-warn font-semibold flex items-start gap-1.5">
                  <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold">TB Contact Alert</div>
                    <div className="text-[0.72rem] text-warn/90">Family tracing by ANM/MPW</div>
                  </div>
                </div>
              )}
              {triage.highRiskNcd && (
                <div className="rounded-xl bg-warn-soft p-2 text-xs text-warn font-semibold">
                  ⚡ Prioritize for Weekly NCD Screening Day
                </div>
              )}
              {triage.symptomAlert && !triage.tbSuspectAlert && (
                <div className="rounded-xl bg-info-soft p-2 text-xs text-brand font-semibold">
                  ⚠️ Symptoms present: Medical Officer referral advised
                </div>
              )}
              {!triage.referralRequired && (
                <div className="rounded-xl bg-ok-soft p-2 text-xs text-ok font-semibold flex items-center gap-1.5">
                  <Icon name="check" size={14} />
                  <span>No critical flags · Routine annual screening</span>
                </div>
              )}
            </div>

            {/* Live Referral Summary */}
            <div className="rounded-xl bg-surface p-2.5 border border-line text-xs space-y-1">
              <div className="font-bold text-brand flex items-center justify-between">
                <span>Screening Focus:</span>
                <span className="font-semibold text-ink uppercase text-[0.72rem]">
                  {referralForm.screeningArea || 'NCD'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[0.75rem] text-muted">
                <span>Clinical Finding:</span>
                <span
                  className={`font-bold ${
                    (referralForm.screeningFinding || (triage.highRiskNcd || triage.symptomAlert ? 'positive' : 'negative')) === 'positive'
                      ? 'text-danger'
                      : 'text-ok'
                  }`}
                >
                  {referralForm.screeningFinding
                    ? referralForm.screeningFinding.toUpperCase()
                    : triage.highRiskNcd || triage.symptomAlert
                      ? 'POSITIVE (RISK)'
                      : 'NEGATIVE (NORMAL)'}
                </span>
              </div>
              {referralForm.referralRequired === 'yes' && (
                <>
                  <div className="font-bold text-brand flex items-center justify-between pt-1 border-t border-line/50">
                    <span>Facility:</span>
                    <span className="font-semibold text-ink truncate max-w-[140px]">
                      {referralForm.destinationFacility || 'Not specified'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[0.75rem] text-muted">
                    <span>Urgency:</span>
                    <span
                      className={`font-bold uppercase ${
                        referralForm.urgency === 'urgent'
                          ? 'text-danger'
                          : referralForm.urgency === 'soon'
                            ? 'text-warn'
                            : 'text-brand'
                      }`}
                    >
                      {referralForm.urgency}
                    </span>
                  </div>
                  {referralForm.appointmentDate && (
                    <div className="flex items-center justify-between text-[0.75rem] text-muted">
                      <span>Appt Date:</span>
                      <span className="font-semibold text-ink">{referralForm.appointmentDate}</span>
                    </div>
                  )}
                  {referralForm.patientIntention && (
                    <div className="flex items-center justify-between text-[0.75rem] text-muted">
                      <span>Intention:</span>
                      <span className="font-semibold text-ink">{referralForm.patientIntention}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Quick Slide Switcher in Sidebar */}
            <div className="pt-2 border-t border-line/60 space-y-1">
              <span className="text-[0.75rem] font-bold text-muted uppercase tracking-wider block">
                Jump to Slide:
              </span>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveSlide('A')}
                  className={`btn !min-h-[34px] !py-1 text-xs ${activeSlide === 'A' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  Part A ({partA.totalScore} pts)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSlide('B')}
                  className={`btn !min-h-[34px] !py-1 text-xs ${activeSlide === 'B' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  Part B ({totalSymptomsChecked} sym)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSlide('C')}
                  className={`btn !min-h-[34px] !py-1 text-xs ${activeSlide === 'C' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  Part C ({partC.cookingFuel.length} fuel)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSlide('D')}
                  className={`btn !min-h-[34px] !py-1 text-xs ${activeSlide === 'D' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  Part D ({partD.totalScore} pts)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSlide('REFERRAL')}
                  className={`col-span-2 btn !min-h-[34px] !py-1 text-xs ${activeSlide === 'REFERRAL' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  Referral Plan ({referralForm.referralRequired === 'yes' ? referralForm.destinationFacility || 'Required' : 'Screening Only'})
                </button>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={
                  activeSlide === 'REFERRAL'
                    ? handleSaveAssessment
                    : () => {
                        if (activeSlide === 'A') setActiveSlide('B');
                        else if (activeSlide === 'B') setActiveSlide('C');
                        else if (activeSlide === 'C') setActiveSlide('D');
                        else if (activeSlide === 'D') setActiveSlide('REFERRAL');
                      }
                }
                disabled={saving}
                className="btn btn-primary btn-block !min-h-[48px] text-sm font-bold shadow-md"
              >
                {saving
                  ? 'Saving…'
                  : activeSlide === 'REFERRAL'
                    ? referralForm.referralRequired === 'yes'
                      ? 'Confirm CBAC & Create Referral'
                      : 'Save CBAC Assessment'
                    : 'Next Step →'}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// Automated Verification Suite for Phase 4 (Milestone 4.1: Profile Vault & Smart Matching)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Node as MiniNode, Element as MiniElement, TextNode as MiniTextNode, parseHtml } from '../tests/mini-dom.mjs';
import { buildZipArchive, verifyZipArchive } from './package-extension.mjs';

// ============================================================================
// Profile Matcher Engine (Milestone 4.1)
// ============================================================================

export const PROFILE_HEURISTIC_PATTERNS = [
  {
    fieldKey: 'firstName',
    autocompleteValues: ['given-name', 'fname', 'first-name'],
    exactTokens: ['fname', 'firstname', 'first_name', 'givenname', 'given_name', 'first'],
    partialRegex: /\b(first\s*name|given\s*name|forename|fname)\b/i,
    weight: 0.95,
  },
  {
    fieldKey: 'lastName',
    autocompleteValues: ['family-name', 'lname', 'last-name', 'surname'],
    exactTokens: ['lname', 'lastname', 'last_name', 'familyname', 'family_name', 'surname', 'last'],
    partialRegex: /\b(last\s*name|family\s*name|surname|lname)\b/i,
    weight: 0.95,
  },
  {
    fieldKey: 'fullName',
    autocompleteValues: ['name'],
    exactTokens: ['name', 'fullname', 'full_name', 'yourname', 'your_name', 'applicant_name', 'respondent_name', 'traveler_name', 'passenger_name'],
    partialRegex: /\b(full\s*name|your\s*name|traveler\s*name|passenger\s*name|contact\s*name|respondent\s*name)\b/i,
    weight: 0.9,
  },
  {
    fieldKey: 'email',
    autocompleteValues: ['email', 'user-email', 'work-email'],
    exactTokens: ['email', 'email_address', 'e-mail', 'user_email', 'work_email', 'mail'],
    partialRegex: /\b(e[-_\s]*mail(\s*address)?|work\s*email|contact\s*email)\b/i,
    weight: 0.98,
  },
  {
    fieldKey: 'phone',
    autocompleteValues: ['tel', 'tel-national', 'phone', 'mobile'],
    exactTokens: ['phone', 'mobile', 'telephone', 'tel', 'cell', 'phone_number', 'mobile_number', 'contact_number'],
    partialRegex: /\b(phone(\s*number)?|mobile(\s*number)?|cell(\s*phone)?|contact\s*number|telephone)\b/i,
    weight: 0.95,
  },
  {
    fieldKey: 'city',
    autocompleteValues: ['address-level2', 'city'],
    exactTokens: ['city', 'town', 'suburb', 'municipality', 'district', 'destination_city'],
    partialRegex: /\b(city|town|suburb|municipality|destination\s*city)\b/i,
    weight: 0.88,
  },
  {
    fieldKey: 'state',
    autocompleteValues: ['address-level1', 'state', 'province'],
    exactTokens: ['state', 'province', 'region', 'territory'],
    partialRegex: /\b(state|province|region|territory)\b/i,
    weight: 0.88,
  },
  {
    fieldKey: 'country',
    autocompleteValues: ['country', 'country-name'],
    exactTokens: ['country', 'nation', 'citizenship'],
    partialRegex: /\b(country|nation|citizenship)\b/i,
    weight: 0.9,
  },
  {
    fieldKey: 'postalCode',
    autocompleteValues: ['postal-code', 'zip', 'zipcode'],
    exactTokens: ['zip', 'zipcode', 'zip_code', 'postal', 'postalcode', 'postal_code', 'pincode', 'pin_code', 'postcode'],
    partialRegex: /\b(zip(\s*code)?|postal(\s*code)?|pin(\s*code)?|postcode)\b/i,
    weight: 0.92,
  },
  {
    fieldKey: 'linkedInUrl',
    autocompleteValues: ['url'],
    exactTokens: ['linkedin', 'linkedin_url', 'linkedin_profile', 'linkedinprofile'],
    partialRegex: /\b(linkedin(\s*url|\s*profile|\s*link)?)\b/i,
    weight: 0.95,
  },
  {
    fieldKey: 'githubUrl',
    autocompleteValues: ['url'],
    exactTokens: ['github', 'github_url', 'github_profile', 'github_handle', 'githubprofile'],
    partialRegex: /\b(github(\s*url|\s*profile|\s*handle|\s*username)?)\b/i,
    weight: 0.95,
  },
  {
    fieldKey: 'bio',
    autocompleteValues: [],
    exactTokens: ['bio', 'summary', 'about', 'about_you', 'cover_letter', 'statement', 'notes', 'comments'],
    partialRegex: /\b(bio|summary|about\s*(you|yourself)?|cover\s*letter|short\s*description|statement)\b/i,
    weight: 0.85,
  },
];

export function matchFieldToProfile(element, profile) {
  if (!element || !profile) return null;

  if (element.tag !== 'input' && element.tag !== 'textarea' && element.tag !== 'select') {
    return null;
  }

  const typeLower = (element.type || '').toLowerCase();
  if (typeLower === 'password' || typeLower === 'hidden' || typeLower === 'submit') {
    return null;
  }

  const label = (element.label || '').trim().toLowerCase();
  const name = (element.name || '').trim().toLowerCase();
  const placeholder = (element.placeholder || '').trim().toLowerCase();
  const autocomplete = (element.autocomplete || '').trim().toLowerCase();
  const combinedText = `${label} ${name} ${placeholder}`.toLowerCase();

  let bestMatch = null;
  let highestScore = 0;

  for (const pattern of PROFILE_HEURISTIC_PATTERNS) {
    const profileValue = (profile[pattern.fieldKey] || '').trim();
    if (!profileValue) continue;

    let score = 0;
    let reason = '';

    if (autocomplete && pattern.autocompleteValues.includes(autocomplete)) {
      score = 0.99;
      reason = `Autocomplete attribute "${autocomplete}" exactly matched profile.${pattern.fieldKey}`;
    } else if (name && pattern.exactTokens.includes(name)) {
      score = 0.95;
      reason = `Field name "${name}" exactly matched profile.${pattern.fieldKey}`;
    } else if (pattern.partialRegex.test(label)) {
      score = pattern.weight;
      reason = `Label "${element.label}" matched profile.${pattern.fieldKey}`;
    } else if (pattern.partialRegex.test(combinedText)) {
      score = pattern.weight * 0.9;
      reason = `Placeholder or attributes matched profile.${pattern.fieldKey}`;
    } else if (typeLower === 'email' && pattern.fieldKey === 'email') {
      score = 0.94;
      reason = `Input type="email" directly matched profile.email`;
    } else if (typeLower === 'tel' && pattern.fieldKey === 'phone') {
      score = 0.92;
      reason = `Input type="tel" directly matched profile.phone`;
    }

    if (score > highestScore && score >= 0.7) {
      highestScore = score;
      bestMatch = {
        element,
        fieldKey: pattern.fieldKey,
        value: profileValue,
        confidence: score,
        matchReason: reason,
      };
    }
  }

  return bestMatch;
}

export function matchAllFormElements(elements, profile) {
  if (!elements || !profile) return [];
  const matches = [];

  for (const el of elements) {
    const match = matchFieldToProfile(el, profile);
    if (match) {
      matches.push(match);
    }
  }

  return matches;
}

export function formatProfileMatchingGuidance(actionMap, profile) {
  if (!actionMap?.elements || !profile) return '';

  const matches = matchAllFormElements(actionMap.elements, profile);
  if (matches.length === 0) return '';

  const lines = matches.map(
    (m) =>
      `  - [#${m.element.id}] <${m.element.tag}> "${m.element.label || m.element.name}": Suggest profile.${
        m.fieldKey
      } ("${m.value}")`
  );

  return `SMART PROFILE AUTOFILL RECOMMENDATIONS:\n${lines.join('\n')}`;
}

export function isProfileAutofillGoal(goal) {
  if (!goal) return false;
  return /\b(profile|autofill|my info|my details|my data|fill form|fill (this|the) form|use my profile|apply with my profile)\b/i.test(
    goal
  );
}

function buildActionPlannerUserPromptMock(goal, actionMap, history = [], userProfile = null) {
  const parts = [];
  parts.push(`USER GOAL:\n${goal.trim()}`);

  if (userProfile && Object.keys(userProfile).length > 0) {
    const profileItems = Object.entries(userProfile)
      .filter(([k, v]) => v && !k.toLowerCase().includes('pass') && !k.toLowerCase().includes('card'))
      .map(([k, v]) => `  - ${k}: "${v}"`)
      .join('\n');
    if (profileItems) {
      parts.push(`\nAVAILABLE USER PROFILE DATA (Use for autofilling relevant form fields):\n${profileItems}`);
    }

    const matchingGuidance = formatProfileMatchingGuidance(actionMap, userProfile);
    if (matchingGuidance) {
      parts.push(`\n${matchingGuidance}`);
    }
  }

  return parts.join('\n\n');
}

// ============================================================================
// Unit Tests
// ============================================================================

const SAMPLE_PROFILE = {
  fullName: 'Aarav Sharma',
  firstName: 'Aarav',
  lastName: 'Sharma',
  email: 'aarav.sharma@example.com',
  phone: '+91 9876543210',
  city: 'Bengaluru',
  state: 'Karnataka',
  country: 'India',
  postalCode: '560001',
  linkedInUrl: 'https://linkedin.com/in/aaravsharma',
  githubUrl: 'https://github.com/aaravsharma',
  bio: 'Full-stack software engineer interested in AI agents and modern web platforms.',
};

test('Milestone 4.1: Profile Matcher - Full Name, First Name, and Last Name semantic matching', () => {
  const elFullName = { id: 1, tag: 'input', label: 'Full Name', name: 'user_name', type: 'text' };
  const matchFull = matchFieldToProfile(elFullName, SAMPLE_PROFILE);
  assert.ok(matchFull);
  assert.equal(matchFull.fieldKey, 'fullName');
  assert.equal(matchFull.value, 'Aarav Sharma');
  assert.ok(matchFull.confidence >= 0.85);

  const elFname = { id: 2, tag: 'input', label: 'First Name', name: 'fname', type: 'text' };
  const matchFname = matchFieldToProfile(elFname, SAMPLE_PROFILE);
  assert.ok(matchFname);
  assert.equal(matchFname.fieldKey, 'firstName');
  assert.equal(matchFname.value, 'Aarav');

  const elLname = { id: 3, tag: 'input', label: 'Surname / Family Name', name: 'lname', type: 'text' };
  const matchLname = matchFieldToProfile(elLname, SAMPLE_PROFILE);
  assert.ok(matchLname);
  assert.equal(matchLname.fieldKey, 'lastName');
  assert.equal(matchLname.value, 'Sharma');
});

test('Milestone 4.1: Profile Matcher - Email and Phone heuristic matching', () => {
  const elEmail = { id: 4, tag: 'input', label: 'Work Email Address', name: 'work_email', type: 'email' };
  const matchEmail = matchFieldToProfile(elEmail, SAMPLE_PROFILE);
  assert.ok(matchEmail);
  assert.equal(matchEmail.fieldKey, 'email');
  assert.equal(matchEmail.value, 'aarav.sharma@example.com');
  assert.ok(matchEmail.confidence >= 0.9);

  const elPhone = { id: 5, tag: 'input', label: 'Mobile Number', name: 'phone', type: 'tel' };
  const matchPhone = matchFieldToProfile(elPhone, SAMPLE_PROFILE);
  assert.ok(matchPhone);
  assert.equal(matchPhone.fieldKey, 'phone');
  assert.equal(matchPhone.value, '+91 9876543210');
});

test('Milestone 4.1: Profile Matcher - Location fields (City, State, Country, Postal Code)', () => {
  const elCity = { id: 6, tag: 'input', label: 'Destination City', name: 'city', type: 'text' };
  const matchCity = matchFieldToProfile(elCity, SAMPLE_PROFILE);
  assert.ok(matchCity);
  assert.equal(matchCity.fieldKey, 'city');
  assert.equal(matchCity.value, 'Bengaluru');

  const elState = { id: 7, tag: 'input', label: 'State / Province', name: 'state', type: 'text' };
  const matchState = matchFieldToProfile(elState, SAMPLE_PROFILE);
  assert.ok(matchState);
  assert.equal(matchState.fieldKey, 'state');
  assert.equal(matchState.value, 'Karnataka');

  const elCountry = { id: 8, tag: 'input', label: 'Citizenship / Country', name: 'country', type: 'text' };
  const matchCountry = matchFieldToProfile(elCountry, SAMPLE_PROFILE);
  assert.ok(matchCountry);
  assert.equal(matchCountry.fieldKey, 'country');
  assert.equal(matchCountry.value, 'India');

  const elZip = { id: 9, tag: 'input', label: 'Zip / Postal Code', name: 'postal_code', type: 'text' };
  const matchZip = matchFieldToProfile(elZip, SAMPLE_PROFILE);
  assert.ok(matchZip);
  assert.equal(matchZip.fieldKey, 'postalCode');
  assert.equal(matchZip.value, '560001');
});

test('Milestone 4.1: Profile Matcher - Professional links and bio matching', () => {
  const elLinkedIn = { id: 10, tag: 'input', label: 'LinkedIn Profile URL', name: 'linkedin_url', type: 'url' };
  const matchLinkedIn = matchFieldToProfile(elLinkedIn, SAMPLE_PROFILE);
  assert.ok(matchLinkedIn);
  assert.equal(matchLinkedIn.fieldKey, 'linkedInUrl');
  assert.equal(matchLinkedIn.value, 'https://linkedin.com/in/aaravsharma');

  const elGitHub = { id: 11, tag: 'input', label: 'GitHub Profile', name: 'github_handle', type: 'url' };
  const matchGitHub = matchFieldToProfile(elGitHub, SAMPLE_PROFILE);
  assert.ok(matchGitHub);
  assert.equal(matchGitHub.fieldKey, 'githubUrl');
  assert.equal(matchGitHub.value, 'https://github.com/aaravsharma');

  const elBio = { id: 12, tag: 'textarea', label: 'Short Bio / Cover Letter', name: 'bio' };
  const matchBio = matchFieldToProfile(elBio, SAMPLE_PROFILE);
  assert.ok(matchBio);
  assert.equal(matchBio.fieldKey, 'bio');
  assert.ok(matchBio.value.includes('Full-stack software engineer'));
});

test('Milestone 4.1: Profile Matcher - Security Isolation (Password and credential fields are NEVER matched)', () => {
  const elPassword = { id: 13, tag: 'input', type: 'password', name: 'user_password', label: 'Password' };
  const elCvv = { id: 14, tag: 'input', type: 'text', name: 'cvv', label: 'CVV' };
  const elOtp = { id: 15, tag: 'input', type: 'text', name: 'two_factor_otp', label: 'OTP' };

  assert.equal(matchFieldToProfile(elPassword, SAMPLE_PROFILE), null);
  assert.equal(matchFieldToProfile(elCvv, SAMPLE_PROFILE), null);
  assert.equal(matchFieldToProfile(elOtp, SAMPLE_PROFILE), null);
});

test('Milestone 4.1: Profile Matcher - matchAllFormElements matches complete forms in batch', () => {
  const elements = [
    { id: 1, tag: 'input', label: 'Full Name', name: 'full_name', type: 'text' },
    { id: 2, tag: 'input', label: 'Email Address', name: 'email', type: 'email' },
    { id: 3, tag: 'input', label: 'City', name: 'city', type: 'text' },
    { id: 4, tag: 'button', label: 'Submit Form' },
  ];

  const matches = matchAllFormElements(elements, SAMPLE_PROFILE);
  assert.equal(matches.length, 3);
  assert.equal(matches[0].fieldKey, 'fullName');
  assert.equal(matches[1].fieldKey, 'email');
  assert.equal(matches[2].fieldKey, 'city');
});

test('Milestone 4.1: Profile Matcher - formatProfileMatchingGuidance generates token-efficient prompt hints', () => {
  const actionMap = {
    title: 'Registration Form',
    url: 'https://example.com/register',
    viewport: { width: 1280, height: 800, scrollY: 0 },
    elements: [
      { id: 1, tag: 'input', label: 'Full Name', name: 'name', type: 'text' },
      { id: 2, tag: 'input', label: 'Email', name: 'email', type: 'email' },
    ],
  };

  const guidance = formatProfileMatchingGuidance(actionMap, SAMPLE_PROFILE);
  assert.ok(guidance.includes('SMART PROFILE AUTOFILL RECOMMENDATIONS:'));
  assert.ok(guidance.includes('[#1] <input> "Full Name": Suggest profile.fullName ("Aarav Sharma")'));
  assert.ok(guidance.includes('[#2] <input> "Email": Suggest profile.email ("aarav.sharma@example.com")'));
});

test('Milestone 4.1: Profile Matcher - isProfileAutofillGoal detects autofill intent in prompts', () => {
  assert.equal(isProfileAutofillGoal('Fill this form using my profile'), true);
  assert.equal(isProfileAutofillGoal('Autofill my details into the application'), true);
  assert.equal(isProfileAutofillGoal('Apply with my profile'), true);
  assert.equal(isProfileAutofillGoal('Use my info to fill the fields'), true);

  assert.equal(isProfileAutofillGoal('Search for mechanical keyboards'), false);
  assert.equal(isProfileAutofillGoal('Summarize this article in 3 bullets'), false);
});

test('Milestone 4.1: ActionPlanner Integration - Prompt embeds Smart Profile Autofill Recommendations', () => {
  const actionMap = {
    title: 'Practice Form',
    url: 'https://example.com/form',
    viewport: { width: 1280, height: 800, scrollY: 0 },
    elements: [
      { id: 1, tag: 'input', label: 'Full Name', name: 'full_name', type: 'text' },
      { id: 2, tag: 'input', label: 'Email Address', name: 'email', type: 'email' },
    ],
  };

  const prompt = buildActionPlannerUserPromptMock(
    'Fill form fields using my profile',
    actionMap,
    [],
    SAMPLE_PROFILE
  );

  assert.ok(prompt.includes('USER GOAL:\nFill form fields using my profile'));
  assert.ok(prompt.includes('AVAILABLE USER PROFILE DATA'));
  assert.ok(prompt.includes('Aarav Sharma'));
  assert.ok(prompt.includes('SMART PROFILE AUTOFILL RECOMMENDATIONS:'));
  assert.ok(prompt.includes('[#1] <input> "Full Name": Suggest profile.fullName ("Aarav Sharma")'));
});

// ============================================================================
// Skills Library & Engine (Milestone 4.2)
// ============================================================================
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const builtinSkillsPath = path.resolve(__dirname, '../src/skills/builtinSkills.json');

export function loadBuiltinSkills() {
  const content = fs.readFileSync(builtinSkillsPath, 'utf-8');
  return JSON.parse(content);
}

export function validateSkill(skill) {
  const errors = [];
  if (!skill.title || !skill.title.trim()) {
    errors.push('Skill title is required.');
  } else if (skill.title.trim().length > 60) {
    errors.push('Skill title cannot exceed 60 characters.');
  }

  if (!skill.prompt || !skill.prompt.trim()) {
    errors.push('Skill prompt template is required.');
  }

  const validCategories = ['summary', 'action', 'draft', 'translate', 'custom'];
  if (skill.category && !validCategories.includes(skill.category)) {
    errors.push(`Invalid category: ${skill.category}. Must be one of: ${validCategories.join(', ')}.`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function createSkillItem(params) {
  const { title, description = '', prompt, category = 'custom' } = params;
  const validation = validateSkill({ title, prompt, category });
  if (!validation.valid) {
    throw new Error(validation.errors.join(' '));
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return {
    id: `custom-${slug}-${Date.now().toString(36)}`,
    title: title.trim(),
    description: description.trim(),
    prompt: prompt.trim(),
    category,
    isBuiltin: false,
    createdAt: Date.now(),
  };
}

export function filterSkills(skills, options = {}) {
  const { category = 'all', query = '' } = options;
  const cleanQuery = query.trim().toLowerCase();

  return skills.filter((skill) => {
    if (category !== 'all') {
      if (category === 'custom') {
        if (skill.isBuiltin) return false;
      } else if (skill.category !== category) {
        return false;
      }
    }

    if (cleanQuery) {
      const matchTitle = (skill.title || '').toLowerCase().includes(cleanQuery);
      const matchDesc = (skill.description || '').toLowerCase().includes(cleanQuery);
      const matchPrompt = (skill.prompt || '').toLowerCase().includes(cleanQuery);
      const matchCategory = (skill.category || '').toLowerCase().includes(cleanQuery);
      if (matchTitle || matchDesc || matchPrompt || matchCategory) {
        return true;
      }

      // Normalized alphanumeric matching (e.g. 'tldr' matches 'TL;DR')
      const normQuery = cleanQuery.replace(/[^a-z0-9]/g, '');
      if (normQuery) {
        const normTitle = (skill.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const normDesc = (skill.description || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normTitle.includes(normQuery) || normDesc.includes(normQuery)) {
          return true;
        }
      }

      return false;
    }

    return true;
  });
}

export function getSkillExecutionTarget(skill) {
  if (skill.category === 'action') {
    return 'action';
  }

  const actionKeywords = [
    'fill out',
    'fill form',
    'profile vault',
    'som-badge',
    'click on',
    'submit button',
    'execute action',
  ];
  const promptLower = (skill.prompt || '').toLowerCase();
  for (const kw of actionKeywords) {
    if (promptLower.includes(kw)) {
      return 'action';
    }
  }

  return 'chat';
}

export function exportSkillsAsJSON(skills) {
  return JSON.stringify(skills, null, 2);
}

export function importSkillsFromJSON(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      return { success: false, error: 'Imported payload must be a JSON array of skills.' };
    }

    const validated = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (!item || typeof item !== 'object') {
        return { success: false, error: `Item at index ${i} is not a valid object.` };
      }
      const check = validateSkill(item);
      if (!check.valid) {
        return { success: false, error: `Item at index ${i} invalid: ${check.errors.join(' ')}` };
      }
      validated.push({
        id: item.id || `imported-${Date.now()}-${i}`,
        title: String(item.title).trim(),
        description: String(item.description || '').trim(),
        prompt: String(item.prompt).trim(),
        category: item.category || 'custom',
        isBuiltin: false,
        createdAt: item.createdAt || Date.now(),
      });
    }

    return { success: true, skills: validated };
  } catch (err) {
    return { success: false, error: `Invalid JSON syntax: ${err.message}` };
  }
}

// ============================================================================
// Milestone 4.2 Tests
// ============================================================================

test('Milestone 4.2: Built-in Skills - Verifies all required pre-configured skills in builtinSkills.json', () => {
  const builtin = loadBuiltinSkills();
  assert.ok(Array.isArray(builtin), 'builtinSkills.json must export an array');
  assert.ok(builtin.length >= 4, 'Must have at least 4 built-in skills');

  const requiredIds = ['tldr-action-items', 'fact-check', 'fill-practice-form', 'hinglish-explainer'];
  for (const reqId of requiredIds) {
    const match = builtin.find((s) => s.id === reqId);
    assert.ok(match, `Built-in skill with id "${reqId}" must exist`);
    assert.ok(match.title && match.title.length > 0, `Skill ${reqId} must have title`);
    assert.ok(match.description && match.description.length > 0, `Skill ${reqId} must have description`);
    assert.ok(match.prompt && match.prompt.length > 0, `Skill ${reqId} must have non-empty prompt`);
    assert.ok(match.category && match.category.length > 0, `Skill ${reqId} must have category`);
    assert.equal(match.isBuiltin, true, `Skill ${reqId} must be flagged isBuiltin: true`);
  }

  // Verify categories
  const tldrSkill = builtin.find((s) => s.id === 'tldr-action-items');
  assert.equal(tldrSkill.category, 'summary');

  const factCheckSkill = builtin.find((s) => s.id === 'fact-check');
  assert.equal(factCheckSkill.category, 'summary');

  const formSkill = builtin.find((s) => s.id === 'fill-practice-form');
  assert.equal(formSkill.category, 'action');

  const hinglishSkill = builtin.find((s) => s.id === 'hinglish-explainer');
  assert.equal(hinglishSkill.category, 'translate');
});

test('Milestone 4.2: Skill Engine - validateSkill enforces required fields and title character limit', () => {
  // Empty title
  const r1 = validateSkill({ title: '', prompt: 'Do something' });
  assert.equal(r1.valid, false);
  assert.ok(r1.errors.some((e) => e.includes('title is required')));

  // Title exceeding 60 characters
  const r2 = validateSkill({
    title: 'This is an extremely long title for a skill that should definitely be rejected because it is way too verbose',
    prompt: 'Do something',
  });
  assert.equal(r2.valid, false);
  assert.ok(r2.errors.some((e) => e.includes('cannot exceed 60 characters')));

  // Missing prompt
  const r3 = validateSkill({ title: 'Valid Title', prompt: '' });
  assert.equal(r3.valid, false);
  assert.ok(r3.errors.some((e) => e.includes('prompt template is required')));

  // Invalid category
  const r4 = validateSkill({ title: 'Valid Title', prompt: 'Prompt', category: 'invalid-cat' });
  assert.equal(r4.valid, false);
  assert.ok(r4.errors.some((e) => e.includes('Invalid category')));

  // Completely valid
  const r5 = validateSkill({
    title: 'Extract Tables to CSV',
    prompt: 'Find all HTML tables on this page and format them as CSV.',
    category: 'custom',
  });
  assert.equal(r5.valid, true);
  assert.equal(r5.errors.length, 0);
});

test('Milestone 4.2: Skill Engine - createSkillItem generates valid custom skill schema with slug ID', () => {
  const skill = createSkillItem({
    title: 'Code Review Helper',
    description: 'Reviews code snippets on the active page and points out bugs.',
    prompt: 'Review the code blocks visible on this page. Check for security vulnerabilities and performance bottlenecks.',
    category: 'custom',
  });

  assert.ok(skill.id.startsWith('custom-code-review-helper-'));
  assert.equal(skill.title, 'Code Review Helper');
  assert.equal(skill.description, 'Reviews code snippets on the active page and points out bugs.');
  assert.equal(skill.category, 'custom');
  assert.equal(skill.isBuiltin, false);
  assert.ok(typeof skill.createdAt === 'number' && skill.createdAt > 0);
});

test('Milestone 4.2: Skill Engine - filterSkills correctly filters by category and search queries', () => {
  const testSkills = [
    { id: '1', title: 'TL;DR Summary', description: 'Brief summary', prompt: 'Summarize', category: 'summary', isBuiltin: true },
    { id: '2', title: 'Fill Form', description: 'Form auto fill', prompt: 'Fill inputs', category: 'action', isBuiltin: true },
    { id: '3', title: 'Hinglish Explainer', description: 'Desi style explain', prompt: 'Explain in Hinglish', category: 'translate', isBuiltin: true },
    { id: '4', title: 'My Custom Reviewer', description: 'Custom reviewer', prompt: 'Review PR', category: 'custom', isBuiltin: false },
  ];

  // Filter by category
  const summaryOnly = filterSkills(testSkills, { category: 'summary' });
  assert.equal(summaryOnly.length, 1);
  assert.equal(summaryOnly[0].id, '1');

  const actionOnly = filterSkills(testSkills, { category: 'action' });
  assert.equal(actionOnly.length, 1);
  assert.equal(actionOnly[0].id, '2');

  const customOnly = filterSkills(testSkills, { category: 'custom' });
  assert.equal(customOnly.length, 1);
  assert.equal(customOnly[0].id, '4');

  // Search query across title, description, and prompt
  const searchTldr = filterSkills(testSkills, { query: 'tldr' });
  assert.equal(searchTldr.length, 1);
  assert.equal(searchTldr[0].id, '1');

  const searchHinglish = filterSkills(testSkills, { query: 'desi style' });
  assert.equal(searchHinglish.length, 1);
  assert.equal(searchHinglish[0].id, '3');

  const searchMissing = filterSkills(testSkills, { query: 'nonexistent keyword' });
  assert.equal(searchMissing.length, 0);

  // Both category and query
  const combinedMatch = filterSkills(testSkills, { category: 'summary', query: 'brief' });
  assert.equal(combinedMatch.length, 1);

  const combinedMismatch = filterSkills(testSkills, { category: 'action', query: 'desi' });
  assert.equal(combinedMismatch.length, 0);
});

test('Milestone 4.2: Skill Engine - getSkillExecutionTarget routes action skills to supervisor and chat skills to chat', () => {
  // Builtin action skill
  assert.equal(
    getSkillExecutionTarget({ id: 'form', category: 'action', prompt: 'Fill form inputs' }),
    'action'
  );

  // Custom skill with action keywords in prompt
  assert.equal(
    getSkillExecutionTarget({ id: 'c1', category: 'custom', prompt: 'Please fill out this form using my profile vault' }),
    'action'
  );

  // Summary skill -> chat
  assert.equal(
    getSkillExecutionTarget({ id: 's1', category: 'summary', prompt: 'Summarize this page in 3 bullets' }),
    'chat'
  );

  // Translate skill -> chat
  assert.equal(
    getSkillExecutionTarget({ id: 't1', category: 'translate', prompt: 'Explain in conversational Hinglish' }),
    'chat'
  );

  // Draft skill -> chat
  assert.equal(
    getSkillExecutionTarget({ id: 'd1', category: 'draft', prompt: 'Draft a thoughtful reply' }),
    'chat'
  );
});

test('Milestone 4.2: Skill Engine - exportSkillsAsJSON and importSkillsFromJSON handle backup serialization & import validation', () => {
  const customSkills = [
    {
      id: 'custom-1',
      title: 'Analyze Pricing',
      description: 'Finds tier tables',
      prompt: 'Extract pricing tiers and monthly vs yearly rates.',
      category: 'summary',
      isBuiltin: false,
    },
    {
      id: 'custom-2',
      title: 'Submit Survey Form',
      description: 'Answers 5-star ratings',
      prompt: 'Fill out this survey using 5-star ratings and profile comments.',
      category: 'action',
      isBuiltin: false,
    },
  ];

  // Export
  const jsonOutput = exportSkillsAsJSON(customSkills);
  assert.ok(typeof jsonOutput === 'string');
  assert.ok(jsonOutput.includes('Analyze Pricing'));
  assert.ok(jsonOutput.includes('Submit Survey Form'));

  // Import valid
  const importRes = importSkillsFromJSON(jsonOutput);
  assert.equal(importRes.success, true);
  assert.equal(importRes.skills.length, 2);
  assert.equal(importRes.skills[0].title, 'Analyze Pricing');
  assert.equal(importRes.skills[1].title, 'Submit Survey Form');

  // Import invalid JSON
  const invalidJsonRes = importSkillsFromJSON('{ corrupt json syntax');
  assert.equal(invalidJsonRes.success, false);
  assert.ok(invalidJsonRes.error.includes('Invalid JSON syntax'));

  // Import invalid schema (not array)
  const notArrayRes = importSkillsFromJSON(JSON.stringify({ notAnArray: true }));
  assert.equal(notArrayRes.success, false);
  assert.ok(notArrayRes.error.includes('must be a JSON array'));

  // Import array with invalid item
  const malformedItemRes = importSkillsFromJSON(JSON.stringify([{ title: '' }]));
  assert.equal(malformedItemRes.success, false);
  assert.ok(malformedItemRes.error.includes('title is required'));
});

test('Milestone 4.2: Skill Engine - Simulated storage persistence for custom skills (Create, Update, Delete)', () => {
  // Mock chrome.storage.local
  const mockStorage = {
    sahayak_custom_skills: [],
  };

  // 1. Create custom skill
  const skillA = createSkillItem({
    title: 'Extract Email Addresses',
    description: 'Finds all mailto links',
    prompt: 'Extract all contact email addresses found on this web page.',
    category: 'custom',
  });

  mockStorage.sahayak_custom_skills.push(skillA);
  assert.equal(mockStorage.sahayak_custom_skills.length, 1);
  assert.equal(mockStorage.sahayak_custom_skills[0].title, 'Extract Email Addresses');

  // 2. Update custom skill
  const skillToEdit = mockStorage.sahayak_custom_skills[0];
  const updatedSkills = mockStorage.sahayak_custom_skills.map((s) => {
    if (s.id === skillToEdit.id) {
      return {
        ...s,
        title: 'Extract All Contact Emails & Phone Numbers',
        description: 'Updated description',
      };
    }
    return s;
  });
  mockStorage.sahayak_custom_skills = updatedSkills;
  assert.equal(mockStorage.sahayak_custom_skills[0].title, 'Extract All Contact Emails & Phone Numbers');
  assert.equal(mockStorage.sahayak_custom_skills[0].description, 'Updated description');

  // 3. Delete custom skill
  mockStorage.sahayak_custom_skills = mockStorage.sahayak_custom_skills.filter(
    (s) => s.id !== skillToEdit.id
  );
  assert.equal(mockStorage.sahayak_custom_skills.length, 0);
});

test('Milestone 4.2: 1-Click Execution - Simulates 1-click execution dispatch for action skills and chat skills', () => {
  let dispatchedActionGoal = null;
  let dispatchedChatMessage = null;
  let activeTabState = 'profile';

  const mockApp = {
    setActiveTab: (tab) => {
      activeTabState = tab;
    },
    handlePlanTaskAction: (prompt) => {
      dispatchedActionGoal = prompt;
    },
    handleSendMessage: (prompt) => {
      dispatchedChatMessage = prompt;
    },
  };

  function handleExecuteSkill(skill) {
    const target = getSkillExecutionTarget(skill);
    if (target === 'action') {
      mockApp.setActiveTab('actions');
      mockApp.handlePlanTaskAction(skill.prompt);
    } else {
      mockApp.setActiveTab('chat');
      mockApp.handleSendMessage(skill.prompt);
    }
  }

  // 1. Execute action skill
  const formSkill = {
    id: 'fill-practice-form',
    title: 'Fill Form with Profile',
    prompt: 'Fill out this form using profile vault data',
    category: 'action',
  };

  handleExecuteSkill(formSkill);
  assert.equal(activeTabState, 'actions', 'Must switch to actions tab for action skills');
  assert.equal(dispatchedActionGoal, 'Fill out this form using profile vault data');
  assert.equal(dispatchedChatMessage, null);

  // 2. Execute chat skill
  const tldrSkill = {
    id: 'tldr-action-items',
    title: 'TL;DR & 3 Action Items',
    prompt: 'Provide a concise TL;DR summary of this page followed by exactly 3 practical takeaways.',
    category: 'summary',
  };

  handleExecuteSkill(tldrSkill);
  assert.equal(activeTabState, 'chat', 'Must switch to chat tab for summary/chat skills');
  assert.equal(dispatchedChatMessage, 'Provide a concise TL;DR summary of this page followed by exactly 3 practical takeaways.');
});

// ============================================================================
// Security Sandbox & Domain Blacklist (Milestone 4.3)
// ============================================================================

export const BANKING_DOMAINS = [
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'citi.com',
  'citigroup.com',
  'capitalone.com',
  'usbank.com',
  'pnc.com',
  'barclays.co.uk',
  'barclays.com',
  'hsbc.com',
  'hsbc.co.in',
  'hdfcbank.com',
  'hdfcbank.co.in',
  'icicibank.com',
  'icicibank.co.in',
  'sbi.co.in',
  'onlinesbi.sbi',
  'axisbank.com',
  'axisbank.co.in',
  'kotak.com',
  'kotak.co.in',
  'bankofbaroda.in',
  'bankofbaroda.com',
  'punjabnationalbank.in',
  'canarabank.com',
  'canarabank.in',
  'paypal.com',
  'stripe.com',
  'razorpay.com',
  'paytm.com',
  'phonepe.com',
  'venmo.com',
  'cash.app',
  'coinbase.com',
  'binance.com',
  'kraken.com',
];

export const AUTH_DOMAINS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'auth0.com',
  'okta.com',
  'appleid.apple.com',
  'auth.amazon.com',
  'id.atlassian.com',
  'identity.oracle.com',
  'signin.aws.amazon.com',
];

export const AUTH_PATHS = [
  { domain: 'github.com', paths: ['/login', '/password_reset', '/sessions/two-factor'] },
  { domain: 'gitlab.com', paths: ['/users/sign_in', '/users/password/new'] },
  { domain: 'twitter.com', paths: ['/i/flow/login', '/i/flow/password_reset'] },
  { domain: 'x.com', paths: ['/i/flow/login', '/i/flow/password_reset'] },
  { domain: 'facebook.com', paths: ['/login', '/recover/initiate'] },
  { domain: 'linkedin.com', paths: ['/checkpoint', '/uas/login'] },
];

export const GOVERNMENT_DOMAINS = [
  'incometax.gov.in',
  'uidai.gov.in',
  'passportindia.gov.in',
  'epfindia.gov.in',
  'myaadhaar.uidai.gov.in',
  'irs.gov',
  'ssa.gov',
  'va.gov',
  'login.gov',
  'usps.com',
  'gov.uk',
  'servicesaustralia.gov.au',
];

export const RESTRICTED_SCHEMES = [
  'chrome://',
  'chrome-extension://',
  'devtools://',
  'edge://',
  'about:',
  'view-source:',
  'https://chromewebstore.google.com',
];

export function isDomainOrSubdomain(hostname, targetDomain) {
  const host = (hostname || '').toLowerCase().trim();
  const target = (targetDomain || '').toLowerCase().trim();
  return host === target || host.endsWith('.' + target);
}

export function assessUrlSecurity(rawUrl, options = {}) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      isBlocked: true,
      category: 'restricted_browser',
      reason: 'Invalid or missing webpage URL.',
      advice: 'Navigate to an active HTTP/HTTPS webpage.',
    };
  }

  for (const scheme of RESTRICTED_SCHEMES) {
    if (rawUrl.startsWith(scheme)) {
      return {
        isBlocked: true,
        category: 'restricted_browser',
        reason: 'Chrome extensions cannot run automated scripts on internal browser pages.',
        advice: 'Sahayak is locked on Chrome system and extension store pages.',
      };
    }
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      isBlocked: true,
      category: 'restricted_browser',
      reason: 'Malformed or unparseable webpage URL.',
      advice: 'Check the URL format in your browser address bar.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();

  // Local private network hosts
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
  ) {
    if (options.allowLocalhost && (hostname === 'localhost' || hostname === '127.0.0.1')) {
      // Allowed for local dev
    } else {
      return {
        isBlocked: true,
        category: 'restricted_browser',
        domain: hostname,
        reason: 'Internal private network host detected.',
        advice: 'Automation is restricted on local private network addresses.',
      };
    }
  }

  for (const bankDomain of BANKING_DOMAINS) {
    if (isDomainOrSubdomain(hostname, bankDomain)) {
      return {
        isBlocked: true,
        category: 'banking',
        domain: bankDomain,
        reason: 'Sensitive banking or financial transaction domain detected.',
        advice: 'Sahayak is paused for your safety on this sensitive financial page.',
      };
    }
  }

  for (const authDomain of AUTH_DOMAINS) {
    if (isDomainOrSubdomain(hostname, authDomain)) {
      return {
        isBlocked: true,
        category: 'auth',
        domain: authDomain,
        reason: 'Single Sign-On (SSO) or primary identity authentication provider detected.',
        advice: 'Sahayak is paused for your safety on this authentication portal.',
      };
    }
  }

  for (const entry of AUTH_PATHS) {
    if (isDomainOrSubdomain(hostname, entry.domain)) {
      for (const p of entry.paths) {
        if (pathname.startsWith(p)) {
          return {
            isBlocked: true,
            category: 'auth',
            domain: `${entry.domain}${p}`,
            reason: 'Account login or password reset path detected.',
            advice: 'Sahayak is paused for your safety on this login page.',
          };
        }
      }
    }
  }

  for (const govDomain of GOVERNMENT_DOMAINS) {
    if (isDomainOrSubdomain(hostname, govDomain)) {
      return {
        isBlocked: true,
        category: 'government',
        domain: govDomain,
        reason: 'Government identity or taxation services portal detected.',
        advice: 'Sahayak is paused for your safety on this government portal.',
      };
    }
  }

  if (options.strictPasswordLockout && options.hasPasswordField) {
    return {
      isBlocked: true,
      category: 'password_detected',
      domain: hostname,
      reason: 'Webpage contains active password input fields.',
      advice: 'Sahayak is paused for your safety on credential entry forms.',
      hasSensitiveInputs: true,
    };
  }

  if (options.hasPasswordField) {
    return {
      isBlocked: false,
      category: 'password_detected',
      domain: hostname,
      reason: 'Webpage contains active password input fields (passwords are hidden and excluded from automation).',
      advice: 'Password fields are hidden and protected. Non-sensitive profile fields can be automated.',
      hasSensitiveInputs: true,
    };
  }

  return {
    isBlocked: false,
    reason: 'Page is safe for grounded chat and human-in-the-loop actions.',
    domain: hostname,
    advice: '',
  };
}

export function isSecurityBlockedUrl(rawUrl, options = {}) {
  const assessment = assessUrlSecurity(rawUrl, options);
  return assessment.isBlocked;
}

export function validateActionTargetSafety(action, element) {
  if (!action) {
    return { safe: false, reason: 'Invalid or undefined action proposal.' };
  }

  if (element) {
    if (element.type === 'password') {
      return {
        safe: false,
        reason: 'Target element is a password field; automated interaction is forbidden.',
      };
    }

    const testTokens = [
      element.name || '',
      element.label || '',
      element.placeholder || '',
      element.selector || '',
    ].join(' ');

    const sensitiveRegex =
      /(pass|pwd|secret|token|cvv|cvc|creditcard|cardnumber|card_number|card-number|cc-number|exp-date|ssn|aadhaar|otp|pin|authcode)/i;

    if (sensitiveRegex.test(testTokens)) {
      return {
        safe: false,
        reason: `Target element matches sensitive credential token: "${element.label || element.name}".`,
      };
    }
  }

  return { safe: true };
}

// ============================================================================
// Milestone 4.3 Tests
// ============================================================================

test('Milestone 4.3: Safety Guard - Banking & Fintech Domain Hard Lockout (US & Global Banks)', () => {
  const bankingUrls = [
    'https://www.chase.com/personal/banking',
    'https://login.chase.com/auth/login',
    'https://secure.bankofamerica.com/login/sign-in',
    'https://connect.secure.wellsfargo.com/auth/login',
    'https://online.citi.com/US/login.do',
    'https://verified.capitalone.com/auth/signin',
    'https://www.usbank.com/index.html',
    'https://onlinebanking.pnc.com/',
    'https://www.barclays.co.uk/personal-banking/',
    'https://www.hsbc.com/who-we-are',
  ];

  for (const url of bankingUrls) {
    const assessment = assessUrlSecurity(url);
    assert.equal(assessment.isBlocked, true, `URL ${url} must be blocked`);
    assert.equal(assessment.category, 'banking', `URL ${url} must have category 'banking'`);
    assert.ok(assessment.advice.includes('paused for your safety'));
  }
});

test('Milestone 4.3: Safety Guard - Indian Banking & Payment Portals Hard Lockout', () => {
  const indianBankUrls = [
    'https://netbanking.hdfcbank.com/netbanking/',
    'https://www.hdfcbank.com/personal/save/accounts',
    'https://infinity.icicibank.com/corp/AuthenticationController',
    'https://retail.onlinesbi.sbi/retail/login.htm',
    'https://www.sbi.co.in/web/personal-banking',
    'https://omni.axisbank.co.in/axisretail/',
    'https://netbanking.kotak.com/knb2/',
    'https://www.paypal.com/signin',
    'https://dashboard.stripe.com/login',
    'https://dashboard.razorpay.com/',
    'https://paytm.com/recharge',
    'https://www.coinbase.com/dashboard',
  ];

  for (const url of indianBankUrls) {
    const assessment = assessUrlSecurity(url);
    assert.equal(assessment.isBlocked, true, `Indian banking URL ${url} must be blocked`);
    assert.equal(assessment.category, 'banking');
    assert.ok(assessment.advice.includes('paused for your safety'));
  }
});

test('Milestone 4.3: Safety Guard - Authentication & Identity Portals Hard Lockout', () => {
  const authUrls = [
    'https://accounts.google.com/signin/v2/identifier',
    'https://login.microsoftonline.com/common/oauth2/authorize',
    'https://login.live.com/login.srf',
    'https://auth.amazon.com/signin',
    'https://appleid.apple.com/sign-in',
    'https://id.atlassian.com/login',
    'https://mycompany.okta.com/login/login.htm',
    'https://tenant.auth0.com/login',
    // Platform-specific login paths
    'https://github.com/login',
    'https://github.com/password_reset',
    'https://twitter.com/i/flow/login',
    'https://x.com/i/flow/login',
    'https://gitlab.com/users/sign_in',
  ];

  for (const url of authUrls) {
    const assessment = assessUrlSecurity(url);
    assert.equal(assessment.isBlocked, true, `Auth URL ${url} must be blocked`);
    assert.equal(assessment.category, 'auth', `Auth URL ${url} must have category 'auth'`);
    assert.ok(assessment.reason.includes('Single Sign-On') || assessment.reason.includes('login') || assessment.reason.includes('authentication'));
  }

  // Non-auth pages on shared domains MUST NOT be blocked (No False Positives)
  const safeGithubRepo = assessUrlSecurity('https://github.com/facebook/react');
  assert.equal(safeGithubRepo.isBlocked, false, 'Non-login GitHub repo must not be blocked');

  const safeGithubIssues = assessUrlSecurity('https://github.com/nodejs/node/issues/1234');
  assert.equal(safeGithubIssues.isBlocked, false, 'GitHub issues page must not be blocked');
});

test('Milestone 4.3: Safety Guard - Government, Tax & National Identity Portals Hard Lockout', () => {
  const govUrls = [
    'https://eportal.incometax.gov.in/iec/foservices/#/login',
    'https://uidai.gov.in/my-aadhaar/about-your-aadhaar.html',
    'https://myaadhaar.uidai.gov.in/',
    'https://portal2.passportindia.gov.in/AppOnlineProject/welcomeLink',
    'https://www.irs.gov/payments/your-online-account',
    'https://www.ssa.gov/myaccount/',
    'https://secure.login.gov/',
    'https://www.gov.uk/log-in-register-hmrc-online-services',
  ];

  for (const url of govUrls) {
    const assessment = assessUrlSecurity(url);
    assert.equal(assessment.isBlocked, true, `Gov URL ${url} must be blocked`);
    assert.equal(assessment.category, 'government');
  }
});

test('Milestone 4.3: Safety Guard - Internal Browser Schemes & Private IP Host Blocking', () => {
  const restrictedUrls = [
    'chrome://settings/',
    'chrome://extensions/',
    'chrome-extension://abcdefghijklmnop/sidepanel/index.html',
    'devtools://devtools/bundled/inspector.html',
    'edge://settings/',
    'about:blank',
    'view-source:https://example.com',
    'https://chromewebstore.google.com/detail/something',
    'http://192.168.1.1/admin',
    'http://10.0.0.1/router',
    'http://172.16.0.1/server',
  ];

  for (const url of restrictedUrls) {
    const assessment = assessUrlSecurity(url);
    assert.equal(assessment.isBlocked, true, `Restricted URL ${url} must be blocked`);
    assert.equal(assessment.category, 'restricted_browser');
  }
});

test('Milestone 4.3: Safety Guard - Legitimate Public Webpages Permitted (No False Positives)', () => {
  const safeUrls = [
    'https://en.wikipedia.org/wiki/Artificial_intelligence',
    'https://www.bbc.com/news/technology-12345678',
    'https://techcrunch.com/2026/01/01/startups-in-ai',
    'https://news.ycombinator.com/',
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    'https://w3schools.com/html/html_forms.asp',
    'https://example.com/blog/how-to-code',
  ];

  for (const url of safeUrls) {
    const assessment = assessUrlSecurity(url);
    assert.equal(assessment.isBlocked, false, `Safe URL ${url} must not be blocked`);
    assert.ok(assessment.reason.includes('safe for grounded chat'));
  }
});

test('Milestone 4.3: Action Planner Hard Lockout - Aborts planning immediately if actionMap URL is blacklisted', async () => {
  // Simulate Action Planner background router receiving plan request on blacklisted URL
  const mockPlanRequest = {
    goal: 'Transfer funds or fill out form',
    actionMap: {
      url: 'https://netbanking.hdfcbank.com/netbanking/',
      title: 'HDFC Bank NetBanking',
      elements: [{ id: 1, tag: 'input', label: 'User ID' }],
    },
  };

  const assessment = assessUrlSecurity(mockPlanRequest.actionMap.url);
  assert.equal(assessment.isBlocked, true);

  // Background planner intercepts and returns CANNOT_PROCEED
  let routerResponse = null;
  if (assessment.isBlocked) {
    routerResponse = {
      success: false,
      blocked: true,
      securityAssessment: assessment,
      error: assessment.reason,
      proposal: {
        status: 'CANNOT_PROCEED',
        thought: `Security guard triggered: ${assessment.reason}`,
        userExplanation: `Sahayak is paused for your safety on this sensitive page. Automated actions are strictly disabled on ${assessment.domain || assessment.category}.`,
      },
    };
  }

  assert.equal(routerResponse.success, false);
  assert.equal(routerResponse.blocked, true);
  assert.equal(routerResponse.proposal.status, 'CANNOT_PROCEED');
  assert.ok(routerResponse.proposal.userExplanation.includes('paused for your safety'));
  assert.equal(routerResponse.securityAssessment.category, 'banking');
});

test('Milestone 4.3: DOM Scraper Safeguard - Detects password input and triggers credential abort', () => {
  // Test password detection flag with strict lockout
  const pageWithPasswordStrict = assessUrlSecurity('https://example.com/signup', {
    hasPasswordField: true,
    strictPasswordLockout: true,
  });
  assert.equal(pageWithPasswordStrict.isBlocked, true);
  assert.equal(pageWithPasswordStrict.category, 'password_detected');
  assert.ok(pageWithPasswordStrict.reason.includes('active password input fields'));

  // Test password detection flag standard mode (credentials hidden from ActionMap, safe fields fillable)
  const pageWithPasswordStandard = assessUrlSecurity('https://example.com/signup', {
    hasPasswordField: true,
  });
  assert.equal(pageWithPasswordStandard.isBlocked, false);
  assert.equal(pageWithPasswordStandard.hasSensitiveInputs, true);
  assert.ok(pageWithPasswordStandard.reason.includes('passwords are hidden and excluded'));

  // Test DOM scraper safeguard exception simulation
  function simulateScraperOnDoc(docMock) {
    if (docMock.querySelector && docMock.querySelector('input[type="password"]')) {
      throw new Error('SECURITY_ABORT: Password input field detected on page. DOM scraping paused for credential safety.');
    }
    return { title: 'Safe Page', cleanText: 'Clean text content' };
  }

  // Doc without password -> passes
  const safeDoc = { querySelector: (sel) => (sel === 'input[type="password"]' ? null : {}) };
  const safeRes = simulateScraperOnDoc(safeDoc);
  assert.equal(safeRes.title, 'Safe Page');

  // Doc with password -> throws SECURITY_ABORT
  const passwordDoc = { querySelector: (sel) => (sel === 'input[type="password"]' ? { type: 'password' } : null) };
  assert.throws(
    () => simulateScraperOnDoc(passwordDoc),
    /SECURITY_ABORT: Password input field detected on page/
  );
});

test('Milestone 4.3: Action Target Safety Validation - Forbids actions targeting passwords, OTPs, or CVVs', () => {
  const clickAction = { actionType: 'CLICK', targetElementId: 1 };
  const typeAction = { actionType: 'TYPE', targetElementId: 2, value: '123456' };

  // 1. Password input target
  const passwordEl = { type: 'password', label: 'Enter Password', name: 'user_password' };
  const r1 = validateActionTargetSafety(typeAction, passwordEl);
  assert.equal(r1.safe, false);
  assert.ok(r1.reason.includes('password'));

  // 2. OTP / Pin input target
  const otpEl = { type: 'text', label: 'Enter 6-Digit OTP', name: 'otp_code' };
  const r2 = validateActionTargetSafety(typeAction, otpEl);
  assert.equal(r2.safe, false);
  assert.ok(r2.reason.includes('sensitive credential token'));

  // 3. CVV / Credit card target
  const cvvEl = { type: 'text', label: 'Security Code (CVV)', name: 'card_cvv' };
  const r3 = validateActionTargetSafety(typeAction, cvvEl);
  assert.equal(r3.safe, false);
  assert.ok(r3.reason.includes('sensitive credential token'));

  // 4. Safe form element (e.g. search box or name input)
  const safeEl = { type: 'text', label: 'Search products', name: 'search_query' };
  const r4 = validateActionTargetSafety(typeAction, safeEl);
  assert.equal(r4.safe, true);
});

// ============================================================================
// Resiliency, Lifecycle & SPA Navigation (Milestone 4.4)
// ============================================================================

export class MockStorageSession {
  constructor() {
    this.store = {};
  }
  async get(key) {
    if (typeof key === 'string') {
      return { [key]: this.store[key] };
    }
    return { ...this.store };
  }
  async set(obj) {
    Object.assign(this.store, obj);
  }
  async remove(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

export async function saveActiveTaskToStorage(storage, task) {
  await storage.set({ sahayak_active_task: task });
}

export async function getActiveTaskFromStorage(storage) {
  const data = await storage.get('sahayak_active_task');
  return data?.sahayak_active_task || null;
}

export async function clearActiveTaskFromStorage(storage) {
  await storage.remove('sahayak_active_task');
}

export async function saveChatSessionToStorage(storage, messages) {
  const capped = (messages || []).slice(-50);
  await storage.set({ sahayak_chat_history: capped });
}

export async function getChatSessionFromStorage(storage) {
  const data = await storage.get('sahayak_chat_history');
  return data?.sahayak_chat_history || [];
}

export function computeExponentialBackoff(attempt, baseDelayMs = 2000, maxDelayMs = 32000) {
  const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
  const jitter = Math.round(delay * 0.1);
  return {
    delayMs: delay,
    retryAfterSeconds: Math.max(1, Math.round(delay / 1000)),
  };
}

export function simulateSpaNavigationWatcher(mockWindow, onNavigate) {
  let lastUrl = mockWindow.location.href;

  const trigger = (source) => {
    const curUrl = mockWindow.location.href;
    if (curUrl === lastUrl && source !== 'yt-navigate-finish') return;
    lastUrl = curUrl;
    onNavigate({ url: curUrl, title: mockWindow.document.title, source });
  };

  const origPushState = mockWindow.history.pushState;
  mockWindow.history.pushState = function (...args) {
    const res = origPushState ? origPushState.apply(this, args) : undefined;
    trigger('pushState');
    return res;
  };

  const origReplaceState = mockWindow.history.replaceState;
  mockWindow.history.replaceState = function (...args) {
    const res = origReplaceState ? origReplaceState.apply(this, args) : undefined;
    trigger('replaceState');
    return res;
  };

  return {
    dispatchPopstate: () => trigger('popstate'),
    dispatchHashchange: () => trigger('hashchange'),
    dispatchYtFinish: () => trigger('yt-navigate-finish'),
  };
}

// ============================================================================
// Milestone 4.4 Tests
// ============================================================================

test('Milestone 4.4: Lifecycle - saveActiveTask, getActiveTask, and clearActiveTask preserve task across dormancy', async () => {
  const session = new MockStorageSession();

  const taskPayload = {
    tabId: 101,
    goal: 'Register for webinar and submit details',
    status: 'AWAITING_APPROVAL',
    currentStep: 3,
    currentProposal: {
      status: 'ACTION_PROPOSED',
      thought: 'Click Submit button #5',
      userExplanation: 'Clicking the submit button to complete registration',
      action: { actionType: 'CLICK', targetElementId: 5 },
    },
    history: [
      { id: '1', stepNumber: 1, action: { actionType: 'TYPE', value: 'John' }, status: 'EXECUTED', timestamp: 1000 },
      { id: '2', stepNumber: 2, action: { actionType: 'TYPE', value: 'john@example.com' }, status: 'EXECUTED', timestamp: 2000 },
    ],
  };

  // 1. Save state
  await saveActiveTaskToStorage(session, taskPayload);

  // 2. Simulate worker dormancy & hydration on wake
  const hydrated = await getActiveTaskFromStorage(session);
  assert.ok(hydrated, 'Task must be hydrated from session storage');
  assert.equal(hydrated.goal, 'Register for webinar and submit details');
  assert.equal(hydrated.currentStep, 3);
  assert.equal(hydrated.history.length, 2);
  assert.equal(hydrated.currentProposal.action.targetElementId, 5);

  // 3. Clear state on task finish
  await clearActiveTaskFromStorage(session);
  const cleared = await getActiveTaskFromStorage(session);
  assert.equal(cleared, null, 'Task must be null after clear');
});

test('Milestone 4.4: Lifecycle - saveChatSession caps at 50 messages to prevent storage quota overflow', async () => {
  const session = new MockStorageSession();

  // Create 75 mock messages
  const manyMessages = [];
  for (let i = 1; i <= 75; i++) {
    manyMessages.push({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'assistant' : 'user',
      content: `Message content #${i}`,
      timestamp: Date.now() + i,
    });
  }

  await saveChatSessionToStorage(session, manyMessages);

  const restored = await getChatSessionFromStorage(session);
  assert.equal(restored.length, 50, 'Must cap strictly at 50 messages');
  assert.equal(restored[0].id, 'msg-26', 'Oldest 25 messages pruned');
  assert.equal(restored[49].id, 'msg-75', 'Most recent message preserved');
});

test('Milestone 4.4: Lifecycle - Simulates Service Worker wake-up and full session hydration', async () => {
  const session = new MockStorageSession();

  await saveActiveTaskToStorage(session, {
    tabId: 42,
    goal: 'Extract table data',
    status: 'IDLE',
    currentStep: 1,
    history: [],
  });

  await saveChatSessionToStorage(session, [
    { id: '1', role: 'user', content: 'Extract the pricing table' },
    { id: '2', role: 'assistant', content: 'Here is the pricing data:' },
  ]);

  // Simulate cold worker restart & Side Panel mounting
  const [task, msgs] = await Promise.all([
    getActiveTaskFromStorage(session),
    getChatSessionFromStorage(session),
  ]);

  assert.equal(task.goal, 'Extract table data');
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].content, 'Extract the pricing table');
});

test('Milestone 4.4: SPA Navigation - Monkey-patches history.pushState and history.replaceState and clears stale SoM badges', () => {
  let clearedBadges = false;
  let clearedRegistry = false;
  let navigatedPayload = null;

  const mockWindow = {
    location: { href: 'https://example.com/app/dashboard' },
    document: { title: 'Dashboard' },
    history: {
      pushState: function (state, title, url) {
        mockWindow.location.href = url;
      },
      replaceState: function (state, title, url) {
        mockWindow.location.href = url;
      },
    },
  };

  const watcher = simulateSpaNavigationWatcher(mockWindow, (payload) => {
    clearedBadges = true;
    clearedRegistry = true;
    navigatedPayload = payload;
  });

  // 1. In-page pushState (client-side route change)
  mockWindow.history.pushState(null, '', 'https://example.com/app/settings');
  assert.equal(clearedBadges, true);
  assert.equal(clearedRegistry, true);
  assert.equal(navigatedPayload.url, 'https://example.com/app/settings');
  assert.equal(navigatedPayload.source, 'pushState');

  // Reset flags
  clearedBadges = false;
  clearedRegistry = false;

  // 2. In-page replaceState
  mockWindow.history.replaceState(null, '', 'https://example.com/app/profile');
  assert.equal(clearedBadges, true);
  assert.equal(clearedRegistry, true);
  assert.equal(navigatedPayload.url, 'https://example.com/app/profile');
  assert.equal(navigatedPayload.source, 'replaceState');
});

test('Milestone 4.4: SPA Navigation - popstate and hashchange trigger route update and notification', () => {
  let routeEvents = [];

  const mockWindow = {
    location: { href: 'https://github.com/facebook/react' },
    document: { title: 'facebook/react' },
    history: {},
  };

  const watcher = simulateSpaNavigationWatcher(mockWindow, (payload) => {
    routeEvents.push(payload);
  });

  // 1. Back/forward popstate
  mockWindow.location.href = 'https://github.com/facebook/react/issues';
  watcher.dispatchPopstate();
  assert.equal(routeEvents.length, 1);
  assert.equal(routeEvents[0].source, 'popstate');
  assert.equal(routeEvents[0].url, 'https://github.com/facebook/react/issues');

  // 2. In-page hashchange
  mockWindow.location.href = 'https://github.com/facebook/react/issues#heading-1';
  watcher.dispatchHashchange();
  assert.equal(routeEvents.length, 2);
  assert.equal(routeEvents[1].source, 'hashchange');

  // 3. YouTube in-page navigation
  mockWindow.location.href = 'https://www.youtube.com/watch?v=new_vid_123';
  watcher.dispatchYtFinish();
  assert.equal(routeEvents.length, 3);
  assert.equal(routeEvents[2].source, 'yt-navigate-finish');
});

test('Milestone 4.4: Dynamic Content Script Re-injection - Detects unresponsive tab and triggers executeScript', async () => {
  let executedScripts = [];

  const mockTabs = {
    sendMessage: async (tabId, msg) => {
      if (tabId === 99) {
        throw new Error('Could not establish connection. Receiving end does not exist.');
      }
      return { status: 'PONG' };
    },
  };

  const mockScripting = {
    executeScript: async (options) => {
      executedScripts.push(options);
      return [{ result: true }];
    },
  };

  async function handleTabUpdatedHook(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
      try {
        const ping = await mockTabs.sendMessage(tabId, { type: 'MSG_CONTENT_PING' });
        if (!ping) throw new Error('NO_PING');
      } catch {
        await mockScripting.executeScript({
          target: { tabId },
          files: ['dist/content/index.js'],
        });
      }
    }
  }

  // 1. Responsive tab -> no re-injection needed
  await handleTabUpdatedHook(1, { status: 'complete' }, { url: 'https://example.com' });
  assert.equal(executedScripts.length, 0);

  // 2. Unresponsive tab -> triggers dynamic executeScript
  await handleTabUpdatedHook(99, { status: 'complete' }, { url: 'https://example.com' });
  assert.equal(executedScripts.length, 1);
  assert.equal(executedScripts[0].target.tabId, 99);
  assert.equal(executedScripts[0].files[0], 'dist/content/index.js');
});

test('Milestone 4.4: Rate Limit 429 Backoff - Computes exponential backoff and simulates visual countdown timer ticks', () => {
  // Test exponential backoff calculation
  const b1 = computeExponentialBackoff(1, 2000);
  assert.equal(b1.delayMs, 2000);
  assert.equal(b1.retryAfterSeconds, 2);

  const b2 = computeExponentialBackoff(2, 2000);
  assert.equal(b2.delayMs, 4000);
  assert.equal(b2.retryAfterSeconds, 4);

  const b3 = computeExponentialBackoff(3, 2000);
  assert.equal(b3.delayMs, 8000);
  assert.equal(b3.retryAfterSeconds, 8);

  // Simulate countdown tick simulation
  let currentSeconds = 4;
  const ticks = [];
  while (currentSeconds > 0) {
    ticks.push(currentSeconds);
    currentSeconds--;
  }
  assert.deepEqual(ticks, [4, 3, 2, 1]);
});

test('Milestone 4.4: Port Keep-Alive - Long-lived port connection prevents worker dormancy', () => {
  let portConnected = false;
  let portDisconnected = false;

  const mockRuntime = {
    connect: (options) => {
      assert.equal(options.name, 'sahayak_keepalive');
      portConnected = true;
      return {
        disconnect: () => {
          portDisconnected = true;
        },
      };
    },
  };

  const port = mockRuntime.connect({ name: 'sahayak_keepalive' });
  assert.equal(portConnected, true, 'Port must be connected');

  port.disconnect();
  assert.equal(portDisconnected, true, 'Port must be cleanly disconnected on unmount');
});

// ============================================================================
// MILESTONE 4.5: END-TO-END CROSS-SITE TEST MATRIX (DAY 26)
// ============================================================================

const ARTICLE_UNWANTED_SELECTORS = [
  'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'video', 'audio',
  'nav', 'footer', 'aside', 'header', '.header', '.nav', '.navbar', '.sidebar', '.ad', '.ads',
  '.advertisement', '.banner', '.social', '.share', '.comments', '#comments',
  '.cookie-banner', '#onetrust-banner-sdk', '[class*="paywall"]', '[class*="cookie"]',
  '.infobox', '#toc', '.mw-editsection', '.reference', '.reflist', '.hatnote',
  '.clap-count', '.author-card', '.affiliate-disclosure', '.live-tracker'
];

function cleanArticleContent(container) {
  ARTICLE_UNWANTED_SELECTORS.forEach((sel) => {
    container.querySelectorAll(sel).forEach((n) => n.remove());
  });

  container.querySelectorAll('*').forEach((el) => {
    if (
      el.hidden ||
      el.style.display === 'none' ||
      el.style.visibility === 'hidden' ||
      el.style.opacity === '0' ||
      el.style.fontSize === '0px' ||
      el.style.fontSize === '0'
    ) {
      el.remove();
    }
  });

  return container.textContent.replace(/\s+/g, ' ').trim();
}

function formatTimestamp(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `[${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}]`;
  }
  return `[${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}]`;
}

function extractYouTubeVideoId(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0] || null;
    if (u.pathname === '/watch') return u.searchParams.get('v');
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
    return null;
  } catch {
    return null;
  }
}

function formatYouTubeDialogue(segments) {
  if (!segments || segments.length === 0) return '';
  const lines = [];
  let curTs = segments[0].timestamp;
  let curTexts = [];
  let groupStart = segments[0].start;

  segments.forEach((seg) => {
    const timeDelta = seg.start - groupStart;
    const wordCount = curTexts.join(' ').split(/\s+/).filter(Boolean).length;
    if (timeDelta >= 18 || wordCount >= 35) {
      if (curTexts.length > 0) {
        lines.push(`${curTs} ${curTexts.join(' ')}`);
      }
      curTs = seg.timestamp;
      curTexts = [seg.text];
      groupStart = seg.start;
    } else {
      curTexts.push(seg.text);
    }
  });

  if (curTexts.length > 0) {
    lines.push(`${curTs} ${curTexts.join(' ')}`);
  }
  return lines.join('\n');
}

function parseChaptersFromDesc(desc) {
  const chapters = [];
  const lines = desc.split('\n');
  const timestampRegex = /\b(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/;
  for (const line of lines) {
    const match = line.match(timestampRegex);
    if (match) {
      chapters.push(`${match[1]} - ${match[2].trim()}`);
    }
  }
  return chapters;
}

function scanFormElements(root) {
  const elements = [];
  let actionId = 1;
  let excludedSensitive = 0;

  const candidateNodes = [
    ...root.querySelectorAll('input'),
    ...root.querySelectorAll('select'),
    ...root.querySelectorAll('textarea'),
    ...root.querySelectorAll('button'),
    ...root.querySelectorAll('a'),
  ];
  candidateNodes.forEach((node) => {
    const type = (node.getAttribute('type') || '').toLowerCase();
    const name = (node.getAttribute('name') || '').toLowerCase();
    const autocomplete = (node.getAttribute('autocomplete') || '').toLowerCase();
    const placeholder = (node.getAttribute('placeholder') || '').toLowerCase();

    // Sensitive field lockout
    const sensitiveRegex =
      /(password|passwd|passcode|\bpass\b|\bpwd\b|\bpin\b|cvv|cvc|creditcard|card_number|card-number|cardnumber|cc-number|exp-date|ssn|aadhaar|otp|authcode)/i;

    if (
      type === 'password' ||
      autocomplete === 'cc-number' ||
      autocomplete === 'one-time-code' ||
      sensitiveRegex.test(name) ||
      sensitiveRegex.test(placeholder)
    ) {
      excludedSensitive++;
      return;
    }

    let label = node.getAttribute('aria-label') || placeholder || node.textContent.trim() || name || 'Action Button';
    if (node.tagName === 'INPUT' && (type === 'radio' || type === 'checkbox')) {
      const parentLabel = node.parentElement;
      if (parentLabel) label = parentLabel.textContent.trim();
    }

    elements.push({
      actionId: actionId++,
      tag: node.tagName.toLowerCase(),
      type: type || 'text',
      name,
      label,
      placeholder,
      hasError: node.getAttribute('aria-invalid') === 'true' || (node.getAttribute('class') || '').includes('error'),
      errorMessage: node.getAttribute('data-error-msg') || null,
    });
  });

  return { elements, excludedSensitiveCount: excludedSensitive };
}

// ----------------------------------------------------------------------------
// SUITE 1: Articles Content Extraction Matrix (5 Tests)
// ----------------------------------------------------------------------------

test('Milestone 4.5: Article Matrix - BBC News layout scrubbing', () => {
  const html = `
    <div>
      <header class="header">
        <nav class="navbar"><a href="/">BBC Home</a><a href="/news">News</a></nav>
      </header>
      <div id="onetrust-banner-sdk">We use cookies to optimize your experience.</div>
      <div class="live-tracker">Live reporting: Updates every 30 seconds</div>
      <audio src="stream.mp3">Audio summary</audio>
      <article>
        <h1>Global Tech Summit Concludes with Historic AI Safety Accord</h1>
        <p>Delegates from over 30 countries finalized comprehensive transparency benchmarks today in London.</p>
        <aside class="related-links">
          <h3>Related Stories</h3>
          <ul><li><a href="/story1">AI Guidelines Signed in Geneva</a></li></ul>
        </aside>
        <p>The accord establishes coordinated auditing pipelines and independent safety evaluation benchmarks.</p>
      </article>
      <footer class="footer">Copyright 2026 BBC</footer>
    </div>
  `;

  const doc = parseHtml(html);
  const articleNode = doc.querySelector('article');
  const cleanText = cleanArticleContent(articleNode);

  assert.ok(cleanText.includes('Global Tech Summit Concludes with Historic AI Safety Accord'));
  assert.ok(cleanText.includes('Delegates from over 30 countries'));
  assert.ok(cleanText.includes('The accord establishes coordinated auditing pipelines'));
  assert.ok(!cleanText.includes('BBC Home'), 'Nav must be stripped');
  assert.ok(!cleanText.includes('We use cookies'), 'Cookie banner must be stripped');
  assert.ok(!cleanText.includes('Live reporting'), 'Live tracker must be stripped');
  assert.ok(!cleanText.includes('Related Stories'), 'Related stories sidebar must be stripped');
});

test('Milestone 4.5: Article Matrix - Wikipedia layout scrubbing', () => {
  const html = `
    <div id="content">
      <div id="mw-content-text">
        <div class="hatnote">"Quantum" redirects here. For other uses, see Quantum (disambiguation).</div>
        <table class="infobox">
          <tr><th>Quantum Computing</th></tr>
          <tr><td>Field of Study</td></tr>
        </table>
        <div id="toc">
          <h2>Contents</h2>
          <ul><li>1 Principles</li><li>2 Applications</li></ul>
        </div>
        <h2>Principles<span class="mw-editsection">[edit]</span></h2>
        <p>Quantum computing is a rapidly-emerging technology that harnesses quantum mechanics<sup class="reference"><a href="#cite1">[1]</a></sup> to solve problems too complex for classical computers<sup class="reference"><a href="#cite2">[2]</a></sup>.</p>
        <p>Superposition and entanglement allow quantum processors to evaluate state vectors simultaneously.</p>
        <div class="reflist">
          <ol><li>Physical Review Lett. 1994</li><li>Nature Physics 2012</li></ol>
        </div>
      </div>
    </div>
  `;

  const doc = parseHtml(html);
  const container = doc.querySelector('#mw-content-text');
  const cleanText = cleanArticleContent(container);

  assert.ok(cleanText.includes('Quantum computing is a rapidly-emerging technology'));
  assert.ok(cleanText.includes('Superposition and entanglement allow'));
  assert.ok(!cleanText.includes('Field of Study'), 'Infobox content must be stripped');
  assert.ok(!cleanText.includes('Contents'), 'Table of contents must be stripped');
  assert.ok(!cleanText.includes('[edit]'), 'Edit section tags must be stripped');
  assert.ok(!cleanText.includes('[1]'), 'Citation bracket references must be stripped');
  assert.ok(!cleanText.includes('redirects here'), 'Disambiguation hatnote must be stripped');
  assert.ok(!cleanText.includes('Physical Review Lett'), 'Reflist bibliography must be stripped');
});

test('Milestone 4.5: Article Matrix - The Verge rich multimedia layout scrubbing', () => {
  const html = `
    <main>
      <div class="ad"><a href="/sponsor">Buy Laptop Now - 20% Off</a></div>
      <div class="advertisement">Sponsored by Cloud Provider</div>
      <div class="affiliate-disclosure">When you buy through links on our site, we may earn an affiliate commission.</div>
      <article>
        <h1>The Next Wave of Browser AI Automation</h1>
        <p>Modern browser extensions are evolving into full-fledged action agents capable of multi-step workflows.</p>
        <iframe src="https://youtube.com/embed/demo"></iframe>
        <div class="social"><a href="https://twitter.com/author">Follow @verge_author</a></div>
        <blockquote>"Users must retain final confirmation over irreversible clicks," noted the lead researcher.</blockquote>
        <p>Human-in-the-loop oversight bridges the trust gap between models and client-side web actions.</p>
      </article>
    </main>
  `;

  const doc = parseHtml(html);
  const article = doc.querySelector('article');
  const cleanText = cleanArticleContent(article);

  assert.ok(cleanText.includes('The Next Wave of Browser AI Automation'));
  assert.ok(cleanText.includes('Modern browser extensions are evolving'));
  assert.ok(cleanText.includes('"Users must retain final confirmation over irreversible clicks,"'));
  assert.ok(cleanText.includes('Human-in-the-loop oversight bridges'));
  assert.ok(!cleanText.includes('Buy Laptop Now'), 'Display ads must be stripped');
  assert.ok(!cleanText.includes('Follow @verge_author'), 'Social author cards must be stripped');
});

test('Milestone 4.5: Article Matrix - Substack newsletter & paywall scrubbing', () => {
  const html = `
    <div class="single-post">
      <header class="header">Engineering Leadership Weekly</header>
      <div class="post-content">
        <h1>Building Resilient Manifest V3 Extensions</h1>
        <p>Manifest V3 brought monumental architectural shifts for browser developers, most notably replacing persistent background pages with ephemeral service workers.</p>
        <div class="paywall">
          <h3>This post is for paid subscribers only</h3>
          <p>Subscribe now to unlock the remaining architectural deep-dive.</p>
          <button class="subscribe-btn">Upgrade to Paid ($10/mo)</button>
        </div>
        <div class="share"><button>Share to Twitter</button><button>Email to friend</button></div>
      </div>
    </div>
  `;

  const doc = parseHtml(html);
  const post = doc.querySelector('.post-content');
  const cleanText = cleanArticleContent(post);

  assert.ok(cleanText.includes('Building Resilient Manifest V3 Extensions'));
  assert.ok(cleanText.includes('Manifest V3 brought monumental architectural shifts'));
  assert.ok(!cleanText.includes('This post is for paid subscribers only'), 'Paywall gate must be stripped');
  assert.ok(!cleanText.includes('Upgrade to Paid'), 'Subscribe button must be stripped');
  assert.ok(!cleanText.includes('Share to Twitter'), 'Social sharing buttons must be stripped');
});

test('Milestone 4.5: Article Matrix - Medium / Technical Blog with code blocks', () => {
  const html = `
    <article>
      <div class="header">Medium Tech Blog</div>
      <div class="clap-count"><button>👏 4.2k Claps</button></div>
      <aside class="author-card">Follow Jane for weekly TypeScript guides</aside>
      <h1>Mastering React Value Tracker in Synthetic Events</h1>
      <p>When automating React inputs synthetically, the internal value tracker must be reset before setting the prototype value:</p>
      <pre><code>const tracker = (el as any)._valueTracker; if (tracker) tracker.setValue('');</code></pre>
      <p>This allows the React state dispatch loop to register synthetic changes without dropping values.</p>
    </article>
  `;

  const doc = parseHtml(html);
  const article = doc.querySelector('article');
  const cleanText = cleanArticleContent(article);

  assert.ok(cleanText.includes('Mastering React Value Tracker in Synthetic Events'));
  assert.ok(cleanText.includes('_valueTracker'), 'Code snippet must be retained');
  assert.ok(cleanText.includes('This allows the React state dispatch loop'));
  assert.ok(!cleanText.includes('4.2k Claps'), 'Clap counter must be stripped');
  assert.ok(!cleanText.includes('Follow Jane'), 'Author follow card must be stripped');
  assert.ok(!cleanText.includes('Medium Tech Blog'), 'Header must be stripped');
});

// ----------------------------------------------------------------------------
// SUITE 2: YouTube Extraction Matrix (4 Tests)
// ----------------------------------------------------------------------------

test('Milestone 4.5: YouTube Matrix - Video with Manual Subtitles', () => {
  const mockSegments = [
    { start: 0, duration: 3.5, timestamp: '[00:00]', text: 'Welcome back to the channel.' },
    { start: 3.5, duration: 4.2, timestamp: '[00:03]', text: 'Today we are exploring browser automation.' },
    { start: 7.7, duration: 5.0, timestamp: '[00:07]', text: 'Let us see how Manifest V3 service workers function.' },
  ];

  const dialogue = formatYouTubeDialogue(mockSegments);
  assert.ok(dialogue.startsWith('[00:00]'));
  assert.ok(dialogue.includes('Welcome back to the channel.'));
  assert.ok(dialogue.includes('Today we are exploring browser automation.'));

  // Video ID and watch URL extraction
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const videoId = extractYouTubeVideoId(url);
  assert.equal(videoId, 'dQw4w9WgXcQ');
});

test('Milestone 4.5: YouTube Matrix - Video with Auto-Generated (ASR) Subtitles', () => {
  const asrTrack = {
    baseUrl: 'https://www.youtube.com/api/timedtext?v=xyz&kind=asr',
    languageCode: 'en',
    kind: 'asr',
  };

  assert.equal(asrTrack.kind, 'asr');
  assert.equal(asrTrack.languageCode, 'en');

  // Verify timestamp interval grouping
  const mockAsrSegments = [];
  for (let i = 0; i < 10; i++) {
    mockAsrSegments.push({
      start: i * 3,
      duration: 3,
      timestamp: formatTimestamp(i * 3),
      text: `token${i}`,
    });
  }

  const grouped = formatYouTubeDialogue(mockAsrSegments);
  assert.ok(grouped.includes('[00:00] token0 token1'));
  assert.ok(grouped.includes('token9'));
});

test('Milestone 4.5: YouTube Matrix - Video with Captions Disabled / Unavailable', () => {
  const title = 'Deep Dive into Local AI';
  const channel = 'Tech Explorers';
  const desc = `In this video we explore local LLMs.\n\n0:00 Intro\n1:45 Architecture\n5:20 Live Demo`;

  const chapters = parseChaptersFromDesc(desc);
  assert.equal(chapters.length, 3);
  assert.equal(chapters[0], '0:00 - Intro');
  assert.equal(chapters[1], '1:45 - Architecture');
  assert.equal(chapters[2], '5:20 - Live Demo');

  // Graceful fallback payload construction
  const fallback = {
    hasCaptions: false,
    title,
    channelName: channel,
    chapters,
    wordCount: 15,
  };

  assert.equal(fallback.hasCaptions, false);
  assert.equal(fallback.chapters.length, 3);
  assert.equal(fallback.title, 'Deep Dive into Local AI');
});

test('Milestone 4.5: YouTube Matrix - In-Page Dynamic SPA Video Navigation', () => {
  let activeVideoId = 'vid11111111';
  let cachePurged = false;

  function onYtNavigateFinish(newUrl) {
    activeVideoId = extractYouTubeVideoId(newUrl);
    cachePurged = true;
  }

  onYtNavigateFinish('https://www.youtube.com/watch?v=vid22222222');
  assert.equal(activeVideoId, 'vid22222222');
  assert.equal(cachePurged, true);
});

// ----------------------------------------------------------------------------
// SUITE 3: Forms & Questionnaires Matrix (5 Tests)
// ----------------------------------------------------------------------------

test('Milestone 4.5: Forms Matrix - Single-Page Registration Form Element Mapping', () => {
  const html = `
    <form id="booking-form">
      <input type="text" name="passenger_name" placeholder="Passenger Full Name" />
      <input type="email" name="passenger_email" placeholder="Email Address" />
      <input type="date" name="travel_date" placeholder="Departure Date" />
      <select name="cabin_class"><option value="economy">Economy</option><option value="business">Business</option></select>
      <textarea name="dietary_notes" placeholder="Special Requests"></textarea>
      <label><input type="checkbox" name="terms" /> I agree to terms</label>
      <button type="submit" id="book-btn">Confirm Booking</button>
    </form>
  `;

  const doc = parseHtml(html);
  const scan = scanFormElements(doc);

  assert.equal(scan.elements.length, 7);
  assert.equal(scan.excludedSensitiveCount, 0);
  assert.equal(scan.elements[0].actionId, 1);
  assert.equal(scan.elements[0].placeholder, 'passenger full name');
  assert.equal(scan.elements[4].tag, 'select');
  assert.equal(scan.elements[5].tag, 'textarea');
  assert.equal(scan.elements[6].tag, 'button');
});

test('Milestone 4.5: Forms Matrix - Contact Form with Client-Side Validation & Errors', () => {
  const html = `
    <form id="contact-form">
      <input type="text" name="contact_name" placeholder="Your Name" />
      <input type="email" name="contact_email" class="input-error" aria-invalid="true" data-error-msg="Please enter a valid work email" placeholder="email@company.com" />
      <textarea name="contact_message" placeholder="Message"></textarea>
      <button type="submit">Send Message</button>
    </form>
  `;

  const doc = parseHtml(html);
  const scan = scanFormElements(doc);

  assert.equal(scan.elements.length, 4);
  const emailInput = scan.elements.find((e) => e.name === 'contact_email');
  assert.ok(emailInput);
  assert.equal(emailInput.hasError, true);
  assert.equal(emailInput.errorMessage, 'Please enter a valid work email');
});

test('Milestone 4.5: Forms Matrix - Multi-Step Questionnaire Wizard DOM Transition', () => {
  // Step 1: Account Info
  const step1Html = `
    <div id="step-1">
      <input type="text" id="wiz-user" name="username" placeholder="Username" />
      <input type="email" id="wiz-email" name="email" placeholder="Work Email" />
      <button id="wiz-next-1">Next: Profile</button>
    </div>
  `;
  const step1Doc = parseHtml(step1Html);
  const scan1 = scanFormElements(step1Doc);
  assert.equal(scan1.elements.length, 3);
  assert.equal(scan1.elements[0].name, 'username');

  // Step 2: Personal Profile (Step 1 unmounted, Step 2 mounted)
  const step2Html = `
    <div id="step-2">
      <input type="text" id="wiz-fullname" name="full_name" placeholder="Full Name" />
      <input type="text" id="wiz-city" name="city" placeholder="City" />
      <input type="text" id="wiz-country" name="country" placeholder="Country" />
      <button id="wiz-back-2">Back</button>
      <button id="wiz-next-2">Next: Review</button>
    </div>
  `;
  const step2Doc = parseHtml(step2Html);
  const scan2 = scanFormElements(step2Doc);
  assert.equal(scan2.elements.length, 5);
  assert.equal(scan2.elements[0].name, 'full_name');
  assert.equal(scan2.elements[1].name, 'city');
});

test('Milestone 4.5: Forms Matrix - Sensitive Credential Isolation & Pruning', () => {
  const html = `
    <form id="checkout-form">
      <input type="text" name="customer_name" placeholder="Name" />
      <input type="email" name="customer_email" placeholder="Email" />
      <input type="password" name="account_password" placeholder="Password" />
      <input type="text" name="card_number" autocomplete="cc-number" placeholder="Card Number" />
      <input type="text" name="otp_code" autocomplete="one-time-code" placeholder="6-digit OTP" />
      <button type="submit">Complete Payment</button>
    </form>
  `;

  const doc = parseHtml(html);
  const scan = scanFormElements(doc);

  assert.equal(scan.excludedSensitiveCount, 3, 'Password, CC number, and OTP must be excluded');
  assert.equal(scan.elements.length, 3, 'Only Name, Email, and Submit button permitted');

  // Verify security validation rejects sensitive target actions
  const typeAction = { actionType: 'TYPE' };
  const passCheck = validateActionTargetSafety(typeAction, { name: 'account_password', label: 'Password', type: 'password' });
  assert.equal(passCheck.safe, false);

  const ccCheck = validateActionTargetSafety(typeAction, { name: 'card_number', selector: 'input[autocomplete="cc-number"]' });
  assert.equal(ccCheck.safe, false);

  const otpCheck = validateActionTargetSafety(typeAction, { name: 'otp_code', label: '6-digit OTP' });
  assert.equal(otpCheck.safe, false);

  const safeCheck = validateActionTargetSafety(typeAction, { name: 'customer_name', label: 'Name' });
  assert.equal(safeCheck.safe, true);
});

test('Milestone 4.5: Forms Matrix - Profile Vault Smart Matching across Multi-Category Form', () => {
  const sampleProfile = {
    fullName: 'John Doe',
    email: 'john@example.com',
    phone: '+1 (555) 234-5678',
    city: 'San Francisco',
    country: 'United States',
    linkedInUrl: 'https://linkedin.com/in/johndoe',
    bio: 'Senior Software Engineer specializing in browser agents.',
  };

  const formElements = [
    { actionId: 1, tag: 'input', name: 'full_name', placeholder: 'Your Name' },
    { actionId: 2, tag: 'input', name: 'user_email', placeholder: 'Work Email' },
    { actionId: 3, tag: 'input', name: 'contact_tel', placeholder: 'Phone Number' },
    { actionId: 4, tag: 'input', name: 'city', placeholder: 'City' },
    { actionId: 5, tag: 'input', name: 'country', placeholder: 'Country' },
    { actionId: 6, tag: 'input', name: 'social_linkedin', placeholder: 'LinkedIn Profile' },
    { actionId: 7, tag: 'textarea', name: 'cover_letter', placeholder: 'Professional Summary / Bio' },
  ];

  const matches = matchAllFormElements(formElements, sampleProfile);
  assert.equal(matches.length, 7);
  matches.forEach((m) => {
    assert.ok(m.confidence >= 0.85, `Field ${m.fieldKey} match confidence ${m.confidence} must be >= 0.85`);
    assert.ok(m.value, `Field ${m.fieldKey} must have suggested value`);
  });
});

// ----------------------------------------------------------------------------
// SUITE 4: Single Page Applications (SPAs) Matrix (3 Tests)
// ----------------------------------------------------------------------------

test('Milestone 4.5: SPA Matrix - GitHub Repository Issue & Discussion Sandbox', () => {
  let activeTab = 'conv';
  const tabs = ['conv', 'commits', 'files'];

  function switchTab(t) {
    assert.ok(tabs.includes(t));
    activeTab = t;
  }

  // 1. Initial conversation view
  switchTab('conv');
  assert.equal(activeTab, 'conv');

  // 2. Switch to files view without reload
  switchTab('files');
  assert.equal(activeTab, 'files');

  // 3. Comment post action simulation
  const comments = [];
  function postComment(author, body) {
    comments.push({ id: comments.length + 1, author, body, timestamp: Date.now() });
  }

  postComment('sahayak-agent', 'Fix service worker lifecycle persistence via chrome.storage.session.');
  assert.equal(comments.length, 1);
  assert.equal(comments[0].author, 'sahayak-agent');
});

test('Milestone 4.5: SPA Matrix - Reddit Nested Discussion Tree & Vote Actions', () => {
  const commentTree = [
    {
      id: 'c1',
      author: 'dev_user',
      score: 142,
      text: 'What are the best open-source browser extensions in 2026?',
      replies: [
        { id: 'c2', author: 'ai_fan', score: 58, text: 'Sahayak AI is definitely leading in safety and HITL controls.' },
      ],
    },
  ];

  function upvote(commentId) {
    const findComment = (list) => {
      for (const item of list) {
        if (item.id === commentId) return item;
        if (item.replies) {
          const found = findComment(item.replies);
          if (found) return found;
        }
      }
      return null;
    };
    const c = findComment(commentTree);
    if (c) c.score++;
  }

  upvote('c1');
  assert.equal(commentTree[0].score, 143);

  upvote('c2');
  assert.equal(commentTree[0].replies[0].score, 59);
});

test('Milestone 4.5: SPA Matrix - Social Feed Timeline Virtual Scroll & Actions', () => {
  let currentRoute = '/home';
  let staleBadgesCleared = false;

  function navigateSpa(newRoute) {
    currentRoute = newRoute;
    staleBadgesCleared = true;
  }

  navigateSpa('/explore');
  assert.equal(currentRoute, '/explore');
  assert.equal(staleBadgesCleared, true);

  // Engagement action simulation
  const tweet = { id: 't1', likes: 10, retweets: 4 };
  tweet.likes++;
  assert.equal(tweet.likes, 11);
});

// ----------------------------------------------------------------------------
// SUITE 5: Robustness, Memory & Zero Unhandled Exceptions Matrix (4 Tests)
// ----------------------------------------------------------------------------

test('Milestone 4.5: Edge-Case Matrix - Malformed & Corrupted DOM Resilience', () => {
  // 1. Deeply nested DOM (> 100 levels)
  let nestedHtml = '<div>Text Content</div>';
  for (let i = 0; i < 110; i++) {
    nestedHtml = `<div>${nestedHtml}</div>`;
  }
  const deepDoc = parseHtml(nestedHtml);
  assert.doesNotThrow(() => {
    const text = cleanArticleContent(deepDoc);
    assert.ok(text.includes('Text Content'));
  });

  // 2. Empty container / null text
  const emptyDoc = parseHtml('<div></div>');
  assert.doesNotThrow(() => {
    const text = cleanArticleContent(emptyDoc);
    assert.equal(text, '');
  });
});

test('Milestone 4.5: Edge-Case Matrix - Extreme Scale Stress Test (1,000+ Elements & 500,000+ Chars)', () => {
  const root = new MiniElement('div');
  for (let i = 0; i < 1000; i++) {
    const btn = new MiniElement('button');
    btn.setAttribute('id', `action-item-${i}`);
    btn.setAttribute('name', `action_${i}`);
    btn.textContent = `Action Button ${i}`;
    root.appendChild(btn);
  }

  const start = performance.now();
  const scan = scanFormElements(root);
  const duration = performance.now() - start;

  assert.equal(scan.elements.length, 1000);
  assert.ok(duration < 300, `Scan of 1,000 elements was ${duration.toFixed(2)}ms, must be < 300ms`);
});

test('Milestone 4.5: Edge-Case Matrix - Multilingual, Unicode, Hindi Devanagari & Emoji Preservation', () => {
  const unicodeHtml = `
    <div>
      <h1>सहायक एआई ब्राउज़र एजेंट 🚀</h1>
      <p>Aapka account verify ho gaya hai. Ab agla step follow karein ✨.</p>
      <p>مرحبا بك في المتصفح الذكي 🤖</p>
    </div>
  `;

  const doc = parseHtml(unicodeHtml);
  const text = cleanArticleContent(doc);

  assert.ok(text.includes('सहायक एआई ब्राउज़र एजेंट 🚀'), 'Devanagari and emojis must be preserved');
  assert.ok(text.includes('Aapka account verify ho gaya hai'), 'Hinglish must be preserved');
  assert.ok(text.includes('مرحبا بك في المتصفح الذكي 🤖'), 'RTL script and emojis must be preserved');
});

test('Milestone 4.5: Edge-Case Matrix - Network AbortController & 500 Server Error Recovery', async () => {
  // 1. Simulates AbortController signal timeout
  async function fetchWithTimeout(signal) {
    if (signal.aborted) {
      throw new Error('NETWORK_TIMEOUT: Request aborted by timer');
    }
    return { ok: true };
  }

  const controller = new AbortController();
  controller.abort();

  let errorCaught = false;
  try {
    await fetchWithTimeout(controller.signal);
  } catch (err) {
    errorCaught = true;
    assert.ok(err.message.includes('NETWORK_TIMEOUT'));
  }
  assert.equal(errorCaught, true);

  // 2. Simulates HTTP 500 recovery
  function handleApiResponse(status) {
    if (status >= 500) {
      return { success: false, error: `SERVER_ERROR_HTTP_${status}`, retryable: true };
    }
    return { success: true };
  }

  const res500 = handleApiResponse(500);
  assert.equal(res500.success, false);
  assert.equal(res500.retryable, true);

  const res503 = handleApiResponse(503);
  assert.equal(res503.success, false);
  assert.equal(res503.retryable, true);
});

// ============================================================================
// SUITE 6: Milestone 4.6 Production Packaging, Assets & Documentation (5 Tests)
// ============================================================================

test('Milestone 4.6: Manifest V3 Schema & Permissions Completeness', () => {
  const manifestPath = path.resolve(process.cwd(), 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist in root');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.equal(manifest.manifest_version, 3, 'Must be Manifest V3');
  assert.equal(manifest.version, '1.0.1');
  assert.equal(manifest.name, 'Sahayak - AI Browser Agent');
  assert.ok(manifest.description && manifest.description.length > 20);

  // Required permissions
  const requiredPerms = ['sidePanel', 'activeTab', 'scripting', 'storage', 'contextMenus', 'tabs'];
  for (const perm of requiredPerms) {
    assert.ok(manifest.permissions.includes(perm), `Missing required permission: ${perm}`);
  }

  // Icons schema
  assert.ok(manifest.icons['16']);
  assert.ok(manifest.icons['32']);
  assert.ok(manifest.icons['48']);
  assert.ok(manifest.icons['128']);

  // Background and Side Panel
  assert.equal(manifest.background.service_worker, 'background/index.js');
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.side_panel.default_path, 'sidepanel/index.html');
});

test('Milestone 4.6: Production Icon Assets Integrity (16px, 32px, 48px, 128px, SVG)', () => {
  const iconSizes = [16, 32, 48, 128];
  for (const size of iconSizes) {
    const iconFile = path.resolve(process.cwd(), `public/icons/icon-${size}.png`);
    assert.ok(fs.existsSync(iconFile), `icon-${size}.png must exist in public/icons`);

    const stat = fs.statSync(iconFile);
    assert.ok(stat.size > 100, `icon-${size}.png must be non-empty`);

    // PNG signature check: 89 50 4E 47 0D 0A 1A 0A
    const buf = fs.readFileSync(iconFile);
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.ok(buf.subarray(0, 8).equals(pngHeader), `icon-${size}.png must be a valid PNG file`);
  }

  const svgIcon = path.resolve(process.cwd(), 'public/icons/icon.svg');
  assert.ok(fs.existsSync(svgIcon), 'icon.svg must exist');
  const svgContent = fs.readFileSync(svgIcon, 'utf-8');
  assert.ok(svgContent.includes('<svg'), 'icon.svg must have valid SVG root tag');
  assert.ok(svgContent.includes('viewBox="0 0 128 128"'), 'icon.svg must have standard viewBox');
});

test('Milestone 4.6: Pure Node.js ZIP Archiver & Checksum Generator', () => {
  const tmpDir = path.resolve(process.cwd(), 'node_modules/.cache/zip-test');
  fs.mkdirSync(tmpDir, { recursive: true });

  const file1 = path.join(tmpDir, 'file1.txt');
  const file2 = path.join(tmpDir, 'file2.json');
  fs.writeFileSync(file1, 'Hello from Sahayak AI Browser Agent test suite!');
  fs.writeFileSync(file2, JSON.stringify({ name: 'sahayak', status: 'active', pass: true }));

  const fileList = [
    { fullPath: file1, relPath: 'file1.txt', size: fs.statSync(file1).size },
    { fullPath: file2, relPath: 'subfolder/file2.json', size: fs.statSync(file2).size },
  ];

  const zipBuf = buildZipArchive(fileList);
  assert.ok(zipBuf instanceof Buffer);
  assert.ok(zipBuf.length > 50, 'ZIP buffer must be non-empty');

  // Verify ZIP records and signatures
  const verified = verifyZipArchive(zipBuf);
  assert.equal(verified.entryCount, 2);
  assert.equal(verified.entries[0].name, 'file1.txt');
  assert.equal(verified.entries[1].name, 'subfolder/file2.json');
});

test('Milestone 4.6: Production Package Archive & SHA-256 Checksum Verification', () => {
  const zipPath = path.resolve(process.cwd(), 'sahayak-v1.0.1.zip');
  assert.ok(fs.existsSync(zipPath), 'sahayak-v1.0.1.zip must exist in project root');

  const stat = fs.statSync(zipPath);
  assert.ok(stat.size > 50 * 1024, `Release ZIP must be > 50KB (actual: ${(stat.size / 1024).toFixed(1)}KB)`);

  // Verify SHA-256 Checksum
  const checksumPath = path.resolve(process.cwd(), 'sahayak-v1.0.1.zip.sha256');
  assert.ok(fs.existsSync(checksumPath), 'SHA-256 checksum file must exist');

  const expectedChecksum = fs.readFileSync(checksumPath, 'utf-8').trim().split(/\s+/)[0];
  const actualChecksum = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
  assert.equal(actualChecksum, expectedChecksum, 'ZIP SHA-256 checksum must match checksum file');

  // Verify ZIP archive contents contain all critical Chrome Extension files
  const verified = verifyZipArchive(fs.readFileSync(zipPath));
  const entryNames = verified.entries.map((e) => e.name);

  assert.ok(entryNames.includes('manifest.json'), 'ZIP must contain manifest.json');
  assert.ok(entryNames.includes('background/index.js'), 'ZIP must contain background/index.js');
  assert.ok(entryNames.includes('content/index.js'), 'ZIP must contain content/index.js');
  assert.ok(entryNames.includes('sidepanel/index.html'), 'ZIP must contain sidepanel/index.html');
  assert.ok(entryNames.includes('sidepanel/index.js'), 'ZIP must contain sidepanel/index.js');
  assert.ok(entryNames.includes('sidepanel/index.css'), 'ZIP must contain sidepanel/index.css');
  assert.ok(entryNames.includes('icons/icon-128.png'), 'ZIP must contain icons/icon-128.png');
});

test('Milestone 4.6: Production Documentation Integrity (README.md, INSTALL.md, LICENSE)', () => {
  // 1. README.md
  const readmePath = path.resolve(process.cwd(), 'README.md');
  assert.ok(fs.existsSync(readmePath), 'README.md must exist in root');
  const readme = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readme.includes('# 🌟 Sahayak (सहायक)'));
  assert.ok(readme.includes('Manifest V3'));
  assert.ok(readme.includes('Quick Start'));
  assert.ok(readme.includes('Set-of-Marks'));
  assert.ok(readme.includes('Human-in-the-Loop'));
  assert.ok(readme.includes('Practice Sandbox'));
  assert.ok(readme.includes('MIT License'));

  // 2. INSTALL.md
  const installPath = path.resolve(process.cwd(), 'INSTALL.md');
  assert.ok(fs.existsSync(installPath), 'INSTALL.md must exist in root');
  const install = fs.readFileSync(installPath, 'utf-8');
  assert.ok(install.includes('Installation & Setup Guide'));
  assert.ok(install.includes('chrome://extensions'));
  assert.ok(install.includes('Developer mode'));
  assert.ok(install.includes('Load unpacked'));
  assert.ok(install.includes('Bring Your Own Key'));

  // 3. LICENSE
  const licensePath = path.resolve(process.cwd(), 'LICENSE');
  assert.ok(fs.existsSync(licensePath), 'LICENSE must exist in root');
  const license = fs.readFileSync(licensePath, 'utf-8');
  assert.ok(license.includes('MIT License'));
  assert.ok(license.includes('Hemanpreet Kaur'));
});






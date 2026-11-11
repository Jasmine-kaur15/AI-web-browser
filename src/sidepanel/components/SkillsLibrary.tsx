import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Zap,
  Play,
  Plus,
  Trash2,
  Edit3,
  Search,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  Download,
  Upload,
  X,
  FileText,
  Languages,
  PenTool,
  Bot,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import type { SkillItem } from '../../shared/types';
import { STORAGE_KEYS } from '../../shared/constants';
import { useStorage } from '../hooks/useStorage';
import {
  BUILTIN_SKILLS,
  SKILL_CATEGORIES,
  SkillCategoryFilter,
  getAllSkills,
  filterSkills,
  validateSkill,
  createSkillItem,
  exportSkillsAsJSON,
  importSkillsFromJSON,
} from '../../skills/skillManager';

interface SkillsLibraryProps {
  onExecuteSkill: (skill: SkillItem) => void;
  onOpenSettings?: () => void;
}

export const SkillsLibrary: React.FC<SkillsLibraryProps> = ({
  onExecuteSkill,
}) => {
  const [customSkills, setCustomSkills] = useStorage<SkillItem[]>(
    STORAGE_KEYS.SKILLS,
    []
  );

  const [activeCategory, setActiveCategory] = useState<SkillCategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSkillIds, setExpandedSkillIds] = useState<Set<string>>(new Set());
  const [executingSkillId, setExecutingSkillId] = useState<string | null>(null);

  // Modal states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillItem | null>(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [editorPrompt, setEditorPrompt] = useState('');
  const [editorCategory, setEditorCategory] = useState<SkillItem['category']>('custom');
  const [editorError, setEditorError] = useState<string | null>(null);

  // Import / Export modal
  const [isIOModalOpen, setIsIOModalOpen] = useState(false);
  const [importJSONText, setImportJSONText] = useState('');
  const [ioStatus, setIoStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedExport, setCopiedExport] = useState(false);

  // Delete confirmation
  const [skillIdToDelete, setSkillIdToDelete] = useState<string | null>(null);

  // Compute merged list of built-in + user custom skills
  const allSkills = useMemo(() => {
    return getAllSkills(customSkills || []);
  }, [customSkills]);

  // Filter skills based on active category & query
  const filteredSkills = useMemo(() => {
    return filterSkills(allSkills, {
      category: activeCategory,
      query: searchQuery,
    });
  }, [allSkills, activeCategory, searchQuery]);

  // Compute category counts for pills
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allSkills.length,
      summary: 0,
      action: 0,
      draft: 0,
      translate: 0,
      custom: 0,
    };
    for (const skill of allSkills) {
      if (skill.isBuiltin) {
        if (counts[skill.category] !== undefined) {
          counts[skill.category]++;
        }
      } else {
        counts.custom++;
      }
    }
    return counts;
  }, [allSkills]);

  const toggleExpand = (id: string) => {
    setExpandedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleRunSkill = (skill: SkillItem) => {
    setExecutingSkillId(skill.id);
    try {
      onExecuteSkill(skill);
    } finally {
      setTimeout(() => {
        setExecutingSkillId(null);
      }, 800);
    }
  };

  const handleOpenAddModal = () => {
    setEditingSkill(null);
    setEditorTitle('');
    setEditorDescription('');
    setEditorPrompt('');
    setEditorCategory('custom');
    setEditorError(null);
    setIsEditorOpen(true);
  };

  const handleOpenEditModal = (skill: SkillItem) => {
    setEditingSkill(skill);
    setEditorTitle(skill.title);
    setEditorDescription(skill.description);
    setEditorPrompt(skill.prompt);
    setEditorCategory(skill.category);
    setEditorError(null);
    setIsEditorOpen(true);
  };

  const handleSaveSkill = async () => {
    const validation = validateSkill({
      title: editorTitle,
      prompt: editorPrompt,
      category: editorCategory,
    });

    if (!validation.valid) {
      setEditorError(validation.errors.join(' '));
      return;
    }

    try {
      if (editingSkill) {
        // Update existing skill
        const updated = (customSkills || []).map((s) => {
          if (s.id === editingSkill.id) {
            return {
              ...s,
              title: editorTitle.trim(),
              description: editorDescription.trim(),
              prompt: editorPrompt.trim(),
              category: editorCategory,
            };
          }
          return s;
        });
        await setCustomSkills(updated);
      } else {
        // Create new skill
        const newSkill = createSkillItem({
          title: editorTitle,
          description: editorDescription,
          prompt: editorPrompt,
          category: editorCategory,
        });
        await setCustomSkills([...(customSkills || []), newSkill]);
      }
      setIsEditorOpen(false);
      setEditorError(null);
    } catch (err: any) {
      setEditorError(err.message || 'Failed to save custom skill.');
    }
  };

  const handleDeleteSkill = async (id: string) => {
    const nextSkills = (customSkills || []).filter((s) => s.id !== id);
    await setCustomSkills(nextSkills);
    setSkillIdToDelete(null);
  };

  const handleExportCopy = async () => {
    const json = exportSkillsAsJSON(customSkills || []);
    try {
      await navigator.clipboard.writeText(json);
      setCopiedExport(true);
      setTimeout(() => setCopiedExport(false), 2000);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  const handleImportSubmit = async () => {
    if (!importJSONText.trim()) {
      setIoStatus({ type: 'error', message: 'Please paste a JSON skills payload.' });
      return;
    }

    const res = importSkillsFromJSON(importJSONText);
    if (!res.success || !res.skills) {
      setIoStatus({ type: 'error', message: res.error || 'Failed to parse JSON.' });
      return;
    }

    const existingIds = new Set((customSkills || []).map((s) => s.id));
    const merged = [...(customSkills || [])];
    let addedCount = 0;

    for (const skill of res.skills) {
      if (existingIds.has(skill.id)) {
        skill.id = `imported-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      }
      merged.push(skill);
      addedCount++;
    }

    await setCustomSkills(merged);
    setIoStatus({
      type: 'success',
      message: `Successfully imported ${addedCount} custom skill${addedCount === 1 ? '' : 's'}!`,
    });
    setImportJSONText('');
    setTimeout(() => {
      setIsIOModalOpen(false);
      setIoStatus(null);
    }, 1200);
  };

  const getCategoryBadgeClass = (category: SkillItem['category']) => {
    switch (category) {
      case 'action':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40';
      case 'summary':
        return 'bg-sky-950/80 text-sky-400 border-sky-500/40';
      case 'draft':
        return 'bg-purple-950/80 text-purple-400 border-purple-500/40';
      case 'translate':
        return 'bg-amber-950/80 text-amber-400 border-amber-500/40';
      case 'custom':
      default:
        return 'bg-indigo-950/80 text-indigo-400 border-indigo-500/40';
    }
  };

  const getCategoryIcon = (category: SkillItem['category']) => {
    switch (category) {
      case 'action':
        return <Bot className="w-3 h-3 text-emerald-400" />;
      case 'summary':
        return <FileText className="w-3 h-3 text-sky-400" />;
      case 'draft':
        return <PenTool className="w-3 h-3 text-purple-400" />;
      case 'translate':
        return <Languages className="w-3 h-3 text-amber-400" />;
      case 'custom':
      default:
        return <Sparkles className="w-3 h-3 text-indigo-400" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 text-slate-100">
      {/* Top Search & Actions Bar */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/50 space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 1-click skills..."
              className="w-full text-xs pl-8 pr-7 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition shrink-0 shadow-sm"
            title="Create Custom Skill"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Skill</span>
          </button>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
          {SKILL_CATEGORIES.map((cat) => {
            const count = categoryCounts[cat.id] ?? 0;
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id as SkillCategoryFilter)}
                className={`px-2 py-0.5 rounded-full font-medium transition whitespace-nowrap flex items-center gap-1 border ${
                  isSelected
                    ? 'bg-sky-950 border-sky-500/70 text-sky-300 shadow-sm'
                    : 'bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`text-[9px] px-1 rounded-full font-bold ${
                    isSelected ? 'bg-sky-500/30 text-sky-200' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Skills List Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredSkills.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-slate-500">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-300">No skills match your filter.</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Try searching for something else or create your own custom prompt skill.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
                >
                  Clear search
                </button>
              )}
              <button
                onClick={handleOpenAddModal}
                className="px-2.5 py-1 text-xs rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium"
              >
                + New Skill
              </button>
            </div>
          </div>
        ) : (
          filteredSkills.map((skill) => {
            const isExpanded = expandedSkillIds.has(skill.id);
            const isExecuting = executingSkillId === skill.id;

            return (
              <div
                key={skill.id}
                className={`rounded-xl border transition p-3 bg-slate-800/60 hover:bg-slate-800/90 ${
                  isExecuting
                    ? 'border-sky-500 bg-sky-950/30 ring-1 ring-sky-500/40'
                    : 'border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-xs text-slate-100 hover:text-sky-300 transition">
                        {skill.title}
                      </span>
                      <span
                        className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${getCategoryBadgeClass(
                          skill.category
                        )}`}
                      >
                        {getCategoryIcon(skill.category)}
                        <span>{skill.category}</span>
                      </span>
                      {!skill.isBuiltin && (
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-950/80 border border-indigo-500/40 text-indigo-300">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                      {skill.description}
                    </p>
                  </div>

                  {/* 1-Click Run Button */}
                  <button
                    onClick={() => handleRunSkill(skill)}
                    disabled={isExecuting}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition shadow ${
                      isExecuting
                        ? 'bg-sky-500 text-white animate-pulse'
                        : 'bg-sky-600 hover:bg-sky-500 text-white'
                    }`}
                    title="Execute Skill Immediately"
                  >
                    {isExecuting ? (
                      <>
                        <Zap className="w-3 h-3 text-amber-300 animate-spin" />
                        <span>Running...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 text-sky-100 fill-sky-100" />
                        <span>Run</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Collapsible Prompt Preview */}
                <div className="mt-2 pt-2 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
                  <button
                    onClick={() => toggleExpand(skill.id)}
                    className="flex items-center gap-1 hover:text-slate-200 transition text-[10px] font-medium"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-3 h-3" />
                        <span>Hide Prompt</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" />
                        <span>View Prompt</span>
                      </>
                    )}
                  </button>

                  {!skill.isBuiltin && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEditModal(skill)}
                        className="text-slate-400 hover:text-sky-300 transition flex items-center gap-1 text-[10px]"
                        title="Edit Skill"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => setSkillIdToDelete(skill.id)}
                        className="text-slate-400 hover:text-rose-400 transition flex items-center gap-1 text-[10px]"
                        title="Delete Skill"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-2 p-2 rounded-lg bg-slate-950/70 border border-slate-800/90 text-[10.5px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed select-text">
                    {skill.prompt}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Utilities */}
      <div className="p-2.5 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <span className="text-[11px] text-slate-500">
          {customSkills?.length || 0} custom skill{(customSkills?.length || 0) === 1 ? '' : 's'} stored locally
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsIOModalOpen(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-slate-200 bg-slate-800/80 border border-slate-700 hover:border-slate-600 transition"
            title="Import or Export Custom Skills"
          >
            <Download className="w-3 h-3" />
            <span>Backup / Import</span>
          </button>
        </div>
      </div>

      {/* CREATE / EDIT CUSTOM SKILL MODAL */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <h3 className="text-xs font-bold text-slate-100">
                  {editingSkill ? 'Edit Custom Skill' : 'Create 1-Click Skill'}
                </h3>
              </div>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1 text-xs">
              {editorError && (
                <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-500/50 text-rose-300 text-[11px] flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                  <span>{editorError}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Skill Title *
                </label>
                <input
                  type="text"
                  value={editorTitle}
                  onChange={(e) => setEditorTitle(e.target.value)}
                  placeholder="e.g. Extract Pricing Table, Summarize PDF..."
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Category *
                </label>
                <select
                  value={editorCategory}
                  onChange={(e) => setEditorCategory(e.target.value as SkillItem['category'])}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="custom">Custom (General)</option>
                  <option value="summary">Summary & Analysis</option>
                  <option value="action">Browser Action (Form/Clicks)</option>
                  <option value="draft">Draft & Reply</option>
                  <option value="translate">Translate & Hinglish</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Brief Description
                </label>
                <input
                  type="text"
                  value={editorDescription}
                  onChange={(e) => setEditorDescription(e.target.value)}
                  placeholder="Quick summary of what this 1-click skill accomplishes..."
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Prompt Instructions *
                </label>
                <textarea
                  rows={4}
                  value={editorPrompt}
                  onChange={(e) => setEditorPrompt(e.target.value)}
                  placeholder="Instructions for the AI when this skill runs..."
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono leading-relaxed"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Sahayak will automatically ground your prompt in the active tab context.
                </p>
              </div>
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-950/50 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsEditorOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSkill}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition shadow"
              >
                {editingSkill ? 'Save Changes' : 'Create Skill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {skillIdToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-xs w-full p-4 space-y-3 shadow-2xl">
            <h4 className="text-xs font-bold text-slate-100">Delete Custom Skill?</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Are you sure you want to delete this custom skill? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setSkillIdToDelete(null)}
                className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteSkill(skillIdToDelete)}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT / EXPORT MODAL */}
      {isIOModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-sky-400" />
                <h3 className="text-xs font-bold text-slate-100">Backup & Import Skills</h3>
              </div>
              <button
                onClick={() => {
                  setIsIOModalOpen(false);
                  setIoStatus(null);
                }}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
              {ioStatus && (
                <div
                  className={`p-2.5 rounded-lg border text-[11px] flex items-start gap-1.5 ${
                    ioStatus.type === 'success'
                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                      : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
                  }`}
                >
                  {ioStatus.type === 'success' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <span>{ioStatus.message}</span>
                </div>
              )}

              {/* Export section */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-slate-300">
                  Export Custom Skills
                </label>
                <p className="text-[10px] text-slate-400">
                  Copy your custom skills JSON to share or back up across devices.
                </p>
                <button
                  onClick={handleExportCopy}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white transition"
                >
                  {copiedExport ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-sky-400" />
                      <span>Copy Skills JSON</span>
                    </>
                  )}
                </button>
              </div>

              {/* Import section */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <label className="block text-[11px] font-semibold text-slate-300">
                  Import Skills from JSON
                </label>
                <p className="text-[10px] text-slate-400">
                  Paste a JSON array of skills to merge into your custom library.
                </p>
                <textarea
                  rows={4}
                  value={importJSONText}
                  onChange={(e) => setImportJSONText(e.target.value)}
                  placeholder='[ { "title": "My Skill", "prompt": "..." } ]'
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono text-[10.5px]"
                />
                <button
                  onClick={handleImportSubmit}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition shadow"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import & Merge Skills</span>
                </button>
              </div>
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-950/50 flex items-center justify-end">
              <button
                onClick={() => {
                  setIsIOModalOpen(false);
                  setIoStatus(null);
                }}
                className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillsLibrary;


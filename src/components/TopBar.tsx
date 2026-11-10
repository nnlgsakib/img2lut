export type StudioSectionId = 'workspace' | 'bulk' | 'lattice' | 'library' | 'spec';

interface TopBarProps {
  activeSection: StudioSectionId;
  onSelectSection: (section: StudioSectionId) => void;
  onExportCube: () => void;
  savedCount: number;
}

export function TopBar({
  activeSection,
  onSelectSection,
  onExportCube,
  savedCount,
}: TopBarProps) {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800/90 bg-[#0B0D11]">
      {/* Zone 1: Single text element wordmark */}
      <a
        href="#workspace"
        onClick={(e) => {
          e.preventDefault();
          onSelectSection('workspace');
        }}
        className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 font-display"
      >
        ChromaCube Studio
      </a>

      {/* Zone 2: 5 clean single-line text navigation links */}
      <nav aria-label="Main navigation" className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
        <a
          href="#workspace"
          onClick={(e) => {
            e.preventDefault();
            onSelectSection('workspace');
          }}
          className={`transition-colors whitespace-nowrap shrink-0 underline-offset-8 hover:text-slate-100 hover:underline ${
            activeSection === 'workspace' ? 'text-amber-400 underline' : ''
          }`}
        >
          Grading Bay
        </a>
        <a
          href="#bulk"
          onClick={(e) => {
            e.preventDefault();
            onSelectSection('bulk');
          }}
          className={`transition-colors whitespace-nowrap shrink-0 underline-offset-8 hover:text-slate-100 hover:underline ${
            activeSection === 'bulk' ? 'text-amber-400 underline' : ''
          }`}
        >
          Bulk Generator
        </a>
        <a
          href="#lattice"
          onClick={(e) => {
            e.preventDefault();
            onSelectSection('lattice');
          }}
          className={`transition-colors whitespace-nowrap shrink-0 underline-offset-8 hover:text-slate-100 hover:underline ${
            activeSection === 'lattice' ? 'text-amber-400 underline' : ''
          }`}
        >
          3D Lattice
        </a>
        <a
          href="#library"
          onClick={(e) => {
            e.preventDefault();
            onSelectSection('library');
          }}
          className={`transition-colors whitespace-nowrap shrink-0 underline-offset-8 hover:text-slate-100 hover:underline ${
            activeSection === 'library' ? 'text-amber-400 underline' : ''
          }`}
        >
          Saved Looks ({savedCount})
        </a>
        <a
          href="#spec"
          onClick={(e) => {
            e.preventDefault();
            onSelectSection('spec');
          }}
          className={`transition-colors whitespace-nowrap shrink-0 underline-offset-8 hover:text-slate-100 hover:underline ${
            activeSection === 'spec' ? 'text-amber-400 underline' : ''
          }`}
        >
          Compatibility
        </a>
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onExportCube}
          className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Export .cube LUT
        </button>
      </div>
    </header>
  );
}

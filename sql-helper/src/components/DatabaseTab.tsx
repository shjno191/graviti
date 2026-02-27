import React from 'react';
import { clsx } from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/useAppStore';
import ParamsTab from './ParamsTab';
import { LabTab } from './LabTab';
import { SchemaTab } from './SchemaTab';
import { GenerateTab } from './GenerateTab';

const DatabaseTab = React.memo(() => {
    const { activeSubTab, setActiveSubTab } = useAppStore(useShallow(state => ({
        activeSubTab: state.databaseSubTab,
        setActiveSubTab: state.setDatabaseSubTab
    })));

    return (
        <div className="flex flex-col h-full fade-in animate-in duration-300">
            <div className="flex justify-center border-b border-gray-100 bg-white sticky top-0 z-50 mb-0 rounded-xl shadow-sm mx-4 mt-2 shrink-0">
                {(['replace', 'data', 'schema', 'generate'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveSubTab(tab)}
                        className={clsx(
                            'px-6 py-3 font-bold text-xs transition-all border-b-2 outline-none capitalize flex items-center gap-2 tracking-wide',
                            activeSubTab === tab
                                ? 'text-primary border-primary bg-primary/5'
                                : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50'
                        )}
                    >
                        {tab === 'replace' && <><span>📝</span> Params Replace</>}
                        {tab === 'data' && <><span>📊</span> Compare Data</>}
                        {tab === 'schema' && <><span>🔍</span> Schema Comparator</>}
                        {tab === 'generate' && <><span>⚡</span> Generate SELECT</>}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-hidden rounded-xl relative min-h-0">
                {activeSubTab === 'replace' && (
                    <div className="h-full w-full overflow-auto">
                        <ParamsTab />
                    </div>
                )}
                {activeSubTab === 'data' && <LabTab />}
                {activeSubTab === 'schema' && (
                    <div className="h-full w-full overflow-auto bg-gray-50/30">
                        <SchemaTab />
                    </div>
                )}
                {activeSubTab === 'generate' && (
                    <div className="h-full w-full overflow-auto bg-gray-50/30">
                        <GenerateTab />
                    </div>
                )}
            </div>
        </div>
    );
});

export default DatabaseTab;

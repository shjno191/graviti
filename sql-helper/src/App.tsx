import { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { ParamsTab } from './components/ParamsTab';
import { SchemaTab } from './components/SchemaTab';
import { GenerateTab } from './components/GenerateTab';
import { SettingsTab } from './components/SettingsTab';
import { clsx } from 'clsx';
import { invoke } from '@tauri-apps/api/tauri';

import { LabTab } from './components/LabTab';

function App() {
    const { activeTab, setActiveTab, setDbConfig } = useAppStore();

    useEffect(() => {
        const init = async () => {
            try {
                const config = await invoke<any>('load_db_settings');
                if (config) {
                    setDbConfig(config);
                }
            } catch (err) {
                console.error('Failed to load DB settings:', err);
            }
        };
        init();
    }, [setDbConfig]);

    return (
        <div className="flex flex-col min-h-screen bg-bg font-sans">
            <header className="bg-gradient-to-br from-primary to-secondary text-white p-5 text-center shadow-md">
                <h1 className="text-2xl font-bold">SQL Helper</h1>
            </header>

            <div className="flex justify-center border-b border-gray-200 bg-white sticky top-0 z-[100] shadow-sm">
                {(['params', 'lab', 'compare', 'generate', 'settings'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={clsx(
                            'px-6 py-4 font-bold text-sm transition-all border-b-4 outline-none capitalize flex items-center gap-2',
                            activeTab === tab
                                ? 'text-primary border-primary bg-primary/5'
                                : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50'
                        )}
                    >
                        {tab === 'params' && <><span>📝</span> Parameter Replacement</>}
                        {tab === 'lab' && <><span>📊</span> Compare Lab</>}
                        {tab === 'compare' && <><span>🔍</span> Schema Comparator</>}
                        {tab === 'generate' && <><span>⚡</span> Generate SELECT</>}
                        {tab === 'settings' && <><span>⚙️</span> Database Settings</>}
                    </button>
                ))}
            </div>

            <main className="flex-1 container mx-auto max-w-full px-5">
                {activeTab === 'params' && <ParamsTab />}
                {activeTab === 'lab' && <LabTab />}
                {activeTab === 'compare' && <SchemaTab />}
                {activeTab === 'generate' && <GenerateTab />}
                {activeTab === 'settings' && <SettingsTab />}
            </main>
        </div>
    );
}

export default App;

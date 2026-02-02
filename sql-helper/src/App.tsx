import { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { ParamsTab } from './components/ParamsTab';
import { SchemaTab } from './components/SchemaTab';
import { GenerateTab } from './components/GenerateTab';
import { SettingsTab } from './components/SettingsTab';
import { clsx } from 'clsx';
import { invoke } from '@tauri-apps/api/tauri';

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

            <div className="flex justify-center border-b border-gray-200 bg-white">
                {(['params', 'compare', 'generate', 'settings'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={clsx(
                            'px-6 py-4 font-medium text-sm transition-colors border-b-2 outline-none capitalize',
                            activeTab === tab
                                ? 'text-primary border-primary'
                                : 'text-gray-500 border-transparent hover:text-gray-700'
                        )}
                    >
                        {tab === 'params' && 'Parameter Replacement'}
                        {tab === 'compare' && 'Schema Comparator'}
                        {tab === 'generate' && 'Generate SELECT'}
                        {tab === 'settings' && 'Database Settings'}
                    </button>
                ))}
            </div>

            <main className="flex-1 container mx-auto max-w-7xl">
                {activeTab === 'params' && <ParamsTab />}
                {activeTab === 'compare' && <SchemaTab />}
                {activeTab === 'generate' && <GenerateTab />}
                {activeTab === 'settings' && <SettingsTab />}
            </main>
        </div>
    );
}

export default App;

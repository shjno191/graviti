import { useAppStore } from './store/useAppStore';
import { ParamsTab } from './components/ParamsTab';
import { SchemaTab } from './components/SchemaTab';
import { GenerateTab } from './components/GenerateTab';
import { clsx } from 'clsx';

function App() {
    const { activeTab, setActiveTab } = useAppStore();

    return (
        <div className="flex flex-col min-h-screen bg-bg font-sans">
            <header className="bg-gradient-to-br from-primary to-secondary text-white p-5 text-center shadow-md">
                <h1 className="text-2xl font-bold">SQL Helper</h1>
            </header>

            <div className="flex justify-center border-b border-gray-200 bg-white">
                {(['params', 'compare', 'generate'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={clsx(
                            'px-6 py-4 font-medium text-sm transition-colors border-b-2 outline-none',
                            activeTab === tab
                                ? 'text-primary border-primary'
                                : 'text-gray-500 border-transparent hover:text-gray-700'
                        )}
                    >
                        {tab === 'params' && 'Parameter Replacement'}
                        {tab === 'compare' && 'Schema Comparator'}
                        {tab === 'generate' && 'Generate SELECT'}
                    </button>
                ))}
            </div>

            <main className="flex-1 container mx-auto max-w-7xl">
                {activeTab === 'params' && <ParamsTab />}
                {activeTab === 'compare' && <SchemaTab />}
                {activeTab === 'generate' && <GenerateTab />}
            </main>
        </div>
    );
}

export default App;

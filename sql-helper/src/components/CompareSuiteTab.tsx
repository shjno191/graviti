import React from 'react';
import { TextCompareTab } from './TextCompareTab';

const CompareSuiteTab = React.memo(() => {
    return (
        <div className="flex flex-col h-full fade-in animate-in duration-300">
            <div className="flex-1 overflow-hidden rounded-xl relative min-h-0">
                <TextCompareTab />
            </div>
        </div>
    );
});

export default CompareSuiteTab;

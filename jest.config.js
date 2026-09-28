const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    moduleNameMapper: {
        // Jest's resolver doesn't understand CSS-only LWC modules imported via @import.
        '^c/financeStyles$': '<rootDir>/force-app/main/default/lwc/financeStyles/financeStyles.css'
    },
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver']
};

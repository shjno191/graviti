# Click-to-Scroll Highlight Feature - Testing Guide

## Overview

This document provides comprehensive testing steps for the improved click-to-scroll highlight feature. The feature allows users to click on Mermaid flow diagram nodes and automatically scroll to and highlight the corresponding source code location.

## Improvements Made

### 1. Enhanced CSS Animation
- **Yellow highlight (light mode)**: Prominent yellow background with glow effect
- **Blue highlight (dark mode)**: Blue background for better visibility in dark theme
- **Smooth pulse animation**: 2-second fade-out with box-shadow and inset border effects
- **No layout shift**: Uses absolute positioning and transparent effects only

### 2. Better Performance
- **Global timer management**: Prevents memory leaks from multiple rapid clicks
- **Optimized reflow handling**: Force reflow only when necessary to restart animation
- **GPU-accelerated animations**: CSS keyframes instead of JavaScript animation
- **Efficient event cleanup**: Proper timer and handler cleanup

### 3. Improved Error Handling
- **Validation checks**: Checks for negative offsets and NaN values
- **Detailed console logging**: Helps debug issues with node clicks
- **Graceful fallback**: Invalid offsets don't crash the app, just log warnings
- **Null safety**: Handles missing elements and invalid ID formats

### 4. Better Documentation
- **Inline comments**: Explains component behavior and protocols
- **Type information**: Clear interface definitions for node IDs
- **Console output**: Detailed logs with component prefixes like `[JavaParserTab]`

## Test Cases

### Test 1: Basic Click-to-Scroll Functionality

**Setup:**
1. Paste a Java class with a method into the JavaParserTab
2. Switch to "Call Graph Analyzer" mode
3. Click "Generate Call Graph"
4. Select a method from the list to generate a flow diagram

**Steps:**
1. Locate a node in the Mermaid diagram (e.g., a method call, external call, or decision)
2. Click on the node

**Expected Results:**
- ✅ The source code viewer on the right scrolls smoothly to the corresponding line
- ✅ The target line is centered in the viewport (`block: 'center'`)
- ✅ The line is highlighted with a yellow/blue glow effect
- ✅ Highlight is visible immediately after scrolling

**Actual Results:**
- [ ] Pass / [ ] Fail - Note any issues:

### Test 2: Highlight Animation Duration

**Setup:** Same as Test 1

**Steps:**
1. Click any diagram node
2. Watch the highlight animation
3. Count approximately 2 seconds

**Expected Results:**
- ✅ Highlight appears immediately with bright yellow/blue
- ✅ Highlight gradually fades over 2 seconds
- ✅ After ~2 seconds, highlight is completely gone
- ✅ No visual artifacts or flicker

**Actual Results:**
- [ ] Pass / [ ] Fail - Note any issues:

### Test 3: Rapid Consecutive Clicks (Same Node)

**Setup:** Same as Test 1

**Steps:**
1. Click the same diagram node twice quickly (within 1 second)
2. Observe the highlight behavior

**Expected Results:**
- ✅ First click: Line highlights and timer starts
- ✅ Second click: Previous highlight is removed, animation restarts from beginning
- ✅ Second highlight is as bright as the first
- ✅ Animation duration resets to 2 seconds from second click
- ✅ No "stuck" highlights or double animations

**Actual Results:**
- [ ] Pass / [ ] Fail - Note any issues:

### Test 4: Different Node Types

**Setup:** Java class with multiple node types (methods, conditions, external calls)

**Steps:**
1. Generate a flow diagram for a method with:
   - Internal method calls
   - External calls (if any)
   - Condition/decision nodes
   - Return statements

2. Click each type of node

**Expected Results:**
- ✅ Internal method nodes: Scroll to method definition line
- ✅ External call nodes: Scroll to the call statement
- ✅ Condition nodes: Scroll to the if/switch statement
- ✅ Return nodes: Scroll to the return statement
- ✅ All highlights work with same animation style

**Actual Results:**
- [ ] Internal methods: Pass / Fail
- [ ] External calls: Pass / Fail
- [ ] Conditions: Pass / Fail
- [ ] Returns: Pass / Fail

### Test 5: Invalid/Missing Targets

**Setup:** Flow diagram with broken or invalid offsets

**Steps:**
1. Click a node that might have an invalid offset
2. Check the browser console

**Expected Results:**
- ✅ No console errors (should be warnings only)
- ✅ Console warning appears: `[SourceCodeViewer] Could not find line for offset: xxx`
- ✅ App continues to function normally
- ✅ User can click other nodes without issues

**Actual Results:**
- [ ] Pass / [ ] Fail - Note warning messages:

### Test 6: Dark Mode Compatibility

**Setup:** Enable dark mode in browser/OS settings

**Steps:**
1. Generate a flow diagram
2. Click diagram nodes
3. Observe highlight color

**Expected Results:**
- ✅ Highlight uses blue color instead of yellow
- ✅ Blue highlight is clearly visible against dark background
- ✅ Animation works smoothly in dark mode
- ✅ No color contrast issues

**Actual Results:**
- [ ] Pass / [ ] Fail - Visual appearance:

### Test 7: Multiple Highlights in Sequence

**Setup:** Same as Test 1

**Steps:**
1. Click node A (scrolls to line 10, highlights)
2. Wait 1 second
3. Click node B (scrolls to line 25, highlights)
4. Wait 1 second
5. Click node A again (scrolls back to line 10)

**Expected Results:**
- ✅ Each click removes the previous highlight before applying new one
- ✅ Line 10 is not highlighted when viewing line 25
- ✅ No visual overlap of highlights
- ✅ No cumulative animation effects
- ✅ All highlights complete cleanup after 2 seconds

**Actual Results:**
- [ ] Pass / [ ] Fail - Note any visual issues:

### Test 8: Scrolling Behavior

**Setup:** Same as Test 1

**Steps:**
1. Click a node near the top of the source
2. Click a node near the bottom
3. Click a node in the middle
4. Observe scrolling smoothness

**Expected Results:**
- ✅ Scrolling is smooth (not instant)
- ✅ Target line ends up centered in viewport
- ✅ Scroll animation completes before highlight animation starts
- ✅ Large scroll distances feel natural

**Actual Results:**
- [ ] Pass / [ ] Fail - Note scrolling quality:

### Test 9: Modal/Enlarged View

**Setup:** Same as Test 1

**Steps:**
1. Generate a diagram
2. Click the "Enlarge" button to open full-screen modal
3. Click diagram nodes in the modal

**Expected Results:**
- ✅ Source viewer on right side of modal updates correctly
- ✅ Highlights work in modal view
- ✅ Smooth scrolling works in modal
- ✅ Closing modal and returning to normal view doesn't cause issues

**Actual Results:**
- [ ] Pass / [ ] Fail - Note any modal-specific issues:

### Test 10: Browser Console Logging

**Setup:** Open browser DevTools (F12) and go to Console tab

**Steps:**
1. Generate a flow diagram
2. Click several diagram nodes
3. Check console output

**Expected Results:**
Console should show messages like:
```
[JavaParserTab] Node clicked: offset-1234
[JavaParserTab] Scrolling to offset 1234
[SourceCodeViewer] Target element found and highlighted
```

- ✅ Messages appear with proper component prefixes
- ✅ No error messages (only warnings for invalid inputs)
- ✅ Messages help debug any issues

**Actual Results:**
- [ ] Pass / [ ] Fail - Sample console output:

## Acceptance Criteria Checklist

Based on the original requirements, verify:

- [ ] **Visual Clarity**: Highlight is clearly visible and stands out
- [ ] **Animation Duration**: Highlight disappears after ~2 seconds
- [ ] **No Layout Shift**: Highlighting doesn't cause page layout to shift
- [ ] **Error Handling**: Invalid targets don't crash the app
- [ ] **Dark Mode**: Works in both light and dark themes
- [ ] **Performance**: No lag or jank when clicking nodes
- [ ] **Multiple Highlights**: Previous highlights cleaned up before new ones applied
- [ ] **Cross-Browser**: Works in Chrome, Firefox, Safari, Edge
- [ ] **All Node Types**: Works for methods, external calls, conditions, returns
- [ ] **Smooth Scrolling**: scrollIntoView with behavior: 'smooth' is respected

## Known Limitations

1. **Byte Offset Dependency**: Requires accurate byte offset calculation - multi-byte characters are handled, but edge cases might exist
2. **Line-Based Granularity**: Highlights entire lines; column-level highlighting not implemented
3. **Animation Duration**: Fixed 2-second duration; not configurable per user
4. **No Persistent Highlights**: Highlights are temporary by design

## Troubleshooting

### Highlight Not Appearing
1. Open browser console (F12)
2. Look for warning messages with `[SourceCodeViewer]`
3. Check if the offset is within valid range for the source
4. Verify the HTML element `source-line-${lineIndex}` exists

### Highlight Stuck/Won't Disappear
1. Check browser console for JavaScript errors
2. Try clicking another node - should force cleanup
3. Refresh the page if stuck

### Highlighting Wrong Line
1. This indicates an offset-to-line conversion issue
2. Check the source code encoding (UTF-8 vs others)
3. Report with sample code that reproduces the issue

### Performance Issues
1. Check if other tabs/applications are using significant CPU
2. Verify Mermaid diagram isn't extremely large
3. Try a smaller test case

## Test Summary

**Total Tests:** 10
**Critical Tests:** 1-4, 6, 8
**Optional Tests:** 5, 7, 9-10

To pass, all critical tests should pass.

---

## Sign-Off

Tested by: _________________
Date: _________________
Result: [ ] All Pass [ ] Some Fail [ ] Critical Fail

Comments:

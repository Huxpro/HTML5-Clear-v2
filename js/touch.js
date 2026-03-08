// The module that handles all user interactions
//
// Modernized: uses native browser scrolling via overflow-y: auto.
// JS only intercepts at boundaries (pull-down/pull-up) and for
// non-scroll gestures (horizontal swipe, long-press reorder, pinch).
//
// Uses Touch Events (not Pointer Events) to avoid pointercancel issues.
// Uses addEventListener directly to bypass Zepto event proxy.
// touchmove is { passive: false } so we can selectively preventDefault.

C.touch = (function () {

    // Dead zone: movement below this doesn't count as "moved"
    var tapTolerance = 8;

    // Threshold to trigger a directional gesture
    var dragThreshold = 15;

    // Long-press delay for reorder
    var sortDelay = 500;

    // TouchData object
    var TouchData = function (e) {

        this.id = e.identifier !== undefined ? e.identifier : 'mouse';

        this.ox = this.cx = e.clientX || e.pageX;
        this.oy = this.cy = e.clientY || e.pageY;

        this.dx = this.dy = 0;
        this.tdx = this.tdy = 0;

        this.ot = this.ct = Date.now();
        this.dt = 0;

        // target item
        var targetItemNode = getParentItem(e.target);
        if (targetItemNode) {
            this.targetItem = C.currentCollection.getItemById(+targetItemNode.dataset.id);
        }

        this.moved = false;

    };

    TouchData.prototype.update = function (e) {

        var x = e.clientX || e.pageX,
            y = e.clientY || e.pageY;

        this.dx = x - this.cx;
        this.cx = x;

        this.dy = y - this.cy;
        this.cy = y;

        this.tdx = this.cx - this.ox;
        this.tdy = this.cy - this.oy;

        // Only count as moved if beyond dead zone
        if (!this.moved && (Math.abs(this.tdx) > tapTolerance || Math.abs(this.tdy) > tapTolerance)) {
            this.moved = true;
        }

        var now = Date.now();
        this.dt = now - this.ct;
        this.ct = now;

    };

    var touches = [];
    var currentAction = null; // null | scroll | swipe | pullDown | pullUp | reorder | pinchIn | pinchOut

    // Scroll boundary tracking
    var atTop = true;
    var atBottom = false;

    // Sort timeout handle
    var sortTimer = null;

    // Pinch data
    var pinchData = {
        od: null, cd: null, delta: null,
        init: function () {
            this.od = Math.abs(touches[0].cy - touches[1].cy);
        },
        update: function () {
            this.cd = Math.abs(touches[0].cy - touches[1].cy);
            this.delta = this.cd - this.od;
        },
        reset: function () {
            this.od = null;
            this.cd = null;
            this.delta = null;
        }
    };

    var isTouch = C.client.isTouch;

    // ---- Sort timeout helpers ----

    function startSortTimeout () {
        sortTimer = setTimeout(function () {
            sortTimer = null;
            triggerSort();
        }, sortDelay);
    }

    function cancelSortTimeout () {
        if (sortTimer) {
            clearTimeout(sortTimer);
            sortTimer = null;
        }
    }

    function triggerSort () {
        // Guard: touch may have been removed
        if (!touches.length || !touches[0].targetItem) return;
        if (currentAction && currentAction !== 'scroll') return;

        currentAction = 'reorder';

        // Disable native scroll during reorder
        var wrapper = C.$wrapper[0];
        wrapper.style.touchAction = 'none';
        wrapper.style.overflowY = 'hidden';

        touches[0].targetItem.onSortStart();
    }

    // ---- Scroll boundary ----

    function updateScrollBounds () {
        var w = C.$wrapper[0];
        atTop = w.scrollTop <= 0;
        atBottom = w.scrollTop >= w.scrollHeight - w.clientHeight - 1;
    }

    // ---- DOM node helper ----

    function getParentItem (node) {
        while (node) {
            if (node.className && typeof node.className === 'string' && node.className.match(/\bitem\b/)) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    function getTouchIndex (id) {
        var i = touches.length;
        while (i--) {
            if (touches[i].id === id) return i;
        }
        return -1;
    }

    // ---- Event handlers ----

    function onStart (e) {

        if (C.isEditing) return;
        if (touches.length >= 2) return;
        if (currentAction && currentAction !== 'scroll') return;

        pub.isDown = true;

        var ev = isTouch ? e.changedTouches[0] : e;
        var touch = new TouchData(ev);
        touches.push(touch);

        if (touches.length === 2) {
            pinchData.init();
        }

        if (touches.length === 1 && touch.targetItem) {
            startSortTimeout();
        }

        updateScrollBounds();
        currentAction = null;

    }

    function onMove (e) {

        if (C.isEditing) return;
        if (!touches.length) return;

        var ev = isTouch ? e.changedTouches[0] : e;
        var id = isTouch ? ev.identifier : 'mouse';
        var idx = getTouchIndex(id);
        if (idx === -1) return;

        touches[idx].update(ev);

        if (touches.length === 2) {
            pinchData.update();
        }

        // Only cancel sort timer after significant movement
        if (touches[0].moved) {
            cancelSortTimeout();
        }

        // ---- Gesture arbiter ----

        if (!currentAction) {

            if (touches.length === 1) {

                var t0 = touches[0];

                // Horizontal swipe (highest priority)
                if (t0.targetItem && Math.abs(t0.tdx) > dragThreshold && Math.abs(t0.tdx) > Math.abs(t0.tdy)) {
                    currentAction = 'swipe';
                    e.preventDefault();
                    t0.targetItem.onDragStart();
                }
                // Pull down at top boundary
                else if (atTop && t0.tdy > dragThreshold) {
                    currentAction = 'pullDown';
                    e.preventDefault();
                    C.currentCollection.onPullStart();
                }
                // Pull up at bottom boundary
                else if (atBottom && t0.tdy < -dragThreshold) {
                    currentAction = 'pullUp';
                    e.preventDefault();
                    C.currentCollection.onPullStart();
                }
                // Vertical movement within bounds → native scroll
                else if (Math.abs(t0.tdy) > dragThreshold) {
                    currentAction = 'scroll';
                    // Don't preventDefault → browser scrolls natively
                }

            } else {
                // Two-finger: check pinch
                if (C.currentCollection.stateType !== C.states.LIST_COLLECTION_VIEW && pinchData.delta < -dragThreshold) {
                    currentAction = 'pinchIn';
                    C.currentCollection.onPinchInStart();
                } else if (pinchData.delta > dragThreshold) {
                    currentAction = 'pinchOut';
                    C.currentCollection.onPinchOutStart();
                }
            }

        } else {

            // Dispatch to active gesture
            switch (currentAction) {
                case 'swipe':
                    e.preventDefault();
                    touches[0].targetItem.onDragMove(touches[0].dx);
                    break;
                case 'pullDown':
                    e.preventDefault();
                    C.currentCollection.onPullMove('down', touches[0].dy);
                    break;
                case 'pullUp':
                    e.preventDefault();
                    C.currentCollection.onPullMove('up', touches[0].dy);
                    break;
                case 'reorder':
                    e.preventDefault();
                    touches[0].targetItem.onSortMove(touches[0].dy);
                    break;
                case 'scroll':
                    // Don't preventDefault → browser scrolls
                    break;
                case 'pinchIn':
                    if (touches.length === 2) C.currentCollection.onPinchInMove(idx, touches[idx]);
                    break;
                case 'pinchOut':
                    if (touches.length === 2) C.currentCollection.onPinchOutMove(idx, touches[idx]);
                    break;
            }

        }

    }

    function onEnd (e) {

        if (C.isEditing) return;

        var ev = isTouch ? e.changedTouches[0] : e;
        var id = isTouch ? ev.identifier : 'mouse';
        var idx = getTouchIndex(id);
        if (idx === -1) return;

        if (touches.length === 1) {
            pub.isDown = false;
        }

        cancelSortTimeout();

        if (!currentAction) {
            // Tap detection
            if (touches[0] && !touches[0].moved) {
                if (touches[0].targetItem) {
                    touches[0].targetItem.onTap(ev);
                } else {
                    C.currentCollection.onTap();
                }
            }
        } else {
            switch (currentAction) {
                case 'swipe':
                    touches[0].targetItem.onDragEnd();
                    break;
                case 'pullDown':
                    C.currentCollection.onPullEnd('down');
                    break;
                case 'pullUp':
                    C.currentCollection.onPullEnd('up');
                    break;
                case 'reorder':
                    touches[0].targetItem.onSortEnd();
                    break;
                case 'scroll':
                    break;
                case 'pinchIn':
                    if (touches.length > 1) {
                        if (pinchData.cd <= pinchData.od * .5) C.currentCollection.onPinchInEnd();
                        else C.currentCollection.onPinchInCancel();
                    }
                    break;
                case 'pinchOut':
                    if (touches.length > 1) {
                        if (pinchData.delta > C.ITEM_HEIGHT) C.currentCollection.onPinchOutEnd();
                        else C.currentCollection.onPinchOutCancel();
                    }
                    break;
            }
            if (touches.length === 1) {
                currentAction = null;
            }
        }

        touches.splice(idx, 1);
        pinchData.reset();

    }

    // ---- Init ----

    function initEvents () {

        var wrapper = C.$wrapper[0];

        // Track scroll position for boundary detection
        wrapper.addEventListener('scroll', updateScrollBounds, { passive: true });
        updateScrollBounds();

        if (isTouch) {

            // Touch device: use Touch Events directly via addEventListener
            // touchmove MUST be { passive: false } so we can selectively preventDefault
            wrapper.addEventListener('touchstart', onStart, { passive: true });
            wrapper.addEventListener('touchmove', onMove, { passive: false });
            wrapper.addEventListener('touchend', onEnd, { passive: true });
            wrapper.addEventListener('touchcancel', onEnd, { passive: true });

        } else {

            // Desktop: mouse events
            wrapper.addEventListener('mousedown', onStart);
            wrapper.addEventListener('mousemove', onMove);
            wrapper.addEventListener('mouseup', onEnd);

            // mouseout handling
            C.$wrapper.on('mouseout', function (e) {
                var x = e.pageX,
                    y = e.pageY,
                    c = C.client;
                if (x <= c.left || x >= c.right || y <= c.top || y >= c.bottom) {
                    onEnd(e);
                }
            });

        }

    }

    // ---- Public interface ----

    var pub = {

        init: function () {
            C.log('Touch: init');
            // NO global touchmove preventDefault!
            initEvents();
        },

        isDown: false,

        updateScrollBounds: updateScrollBounds

    };

    return pub;

}());

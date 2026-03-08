C.listCollection = {

    __proto__: C.Collection,

    init: function () {

        C.log('ListCollection: init');

        this.stateType = C.states.LIST_COLLECTION_VIEW;
        this.base = C.Collection;
        this.itemType = C.ListItem;
        this.itemTypeText = 'List';

        // apply shared init
        this.base.init.apply(this, arguments);

        // private init jobs
        this.updateColor();
        this.updatePosition();

        this.openedAt = -1; // used to record currently opened list

    },

    render: function () {

        this.el = $('<div id="list-collection" class="collection">\
                        <div class="credit">Modified Version - Native Scroll <br> Original by Evan You</div>\
                        <div class="item dummy-item top list-item empty">\
                            <div class="slider" style="background-color:rgb(23,128,247)"><div class="inner">\
                                <span class="title">Pull to Create List</span>\
                                <div class="count">0</div>\
                            </div></div>\
                        </div>\
                    </div>');

        this.style = this.el[0].style;

    },

    load: function () {

        this.initiated = true;
        this.el.appendTo(C.$wrapper);

    },

    // open when a ListItem is tapped.
    open: function (at) {

        this.openedAt = at;

        var t = this;

        this.beginSwitch();

        // move current and up to top, drop anything below
        var i = t.items.length,
            item,
            ty;
        while (i--) {
            item = t.items[i];
            var scrollOffset = C.$wrapper[0].scrollTop;
            if (item.data.order <= at) {
                ty = (item.data.order - at) * C.ITEM_HEIGHT - scrollOffset;
            } else {
                ty = C.client.height + (item.data.order - at) * C.ITEM_HEIGHT - scrollOffset;
            }
            item.moveY(ty);
        }

        // listen for transition end on the last item
        item.onTransitionEnd(function () {
            t.positionForPulldown();
        });

    },

    // position the collection for pulldown from a TodoCollection.
    positionForPulldown: function () {

        var t = this;
        t.hideOffScreen();

        setTimeout(function () {
            t.updatePosition();
            t.moveY(-t.height - C.ITEM_HEIGHT);
            t.el.addClass('drag');
            // stays display:none until showForSwitch() is called during pull gesture
        }, 0);

    },

    // position the collection for pinch in from a TodoCollection.
    positionForPinchIn: function () {

    },

    // Override onPullMove for boundary pull gestures
    onPullMove: function (direction, dy) {

        // Call base for pull-down dummy item animation
        this.base.onPullMove.apply(this, arguments);

        var ltc = C.lastTodoCollection;
        var offset = this.pullOffset;

        if (direction === 'up') {

            // Pull up from bottom - switch to last todo collection
            var pullUp = -offset; // make positive

            if (pullUp > 0) {

                // Apply visual offset
                this.style[C.client.transformProperty] = 'translate3d(0px,' + (-pullUp) + 'px, 0px)';

                if (!this.longPullingUp) {
                    this.longPullingUp = true;
                    ltc.showForSwitch();
                    ltc.el.addClass('drag');
                    ltc.topSwitch.show();
                }
                ltc.moveY(this.y + Math.max(this.height + C.ITEM_HEIGHT * 2, C.client.height + C.ITEM_HEIGHT) - pullUp);

                if (pullUp > C.ITEM_HEIGHT) {
                    if (!this.pastLongPullDownThreshold) {
                        this.pastLongPullDownThreshold = true;
                        ltc.topArrow.addClass('down');
                    }
                } else {
                    if (this.pastLongPullDownThreshold) {
                        this.pastLongPullDownThreshold = false;
                        ltc.topArrow.removeClass('down');
                    }
                }

            } else {
                if (this.longPullingUp) {
                    this.longPullingUp = false;
                    ltc.topSwitch.hide();
                    ltc.moveY(C.client.height + C.ITEM_HEIGHT);
                    ltc.hideOffScreen();
                }
            }

        }

    },

    // Override onPullEnd for boundary pull gestures
    onPullEnd: function (direction) {

        var offset = this.pullOffset;
        this.resetDragStates();

        if (direction === 'down') {

            if (offset >= C.ITEM_HEIGHT) {
                this.createItemAtTop();
                return;
            }

        } else if (direction === 'up') {

            var pullUp = -offset;

            if (pullUp >= C.ITEM_HEIGHT) {
                this.onPullUp();
                return;
            } else if (pullUp > 0) {
                // Pull up cancelled
                var ltc = C.lastTodoCollection;
                ltc.el.removeClass('drag').addClass('ease-out');
                ltc.moveY(C.client.height + C.ITEM_HEIGHT);
                ltc.onTransitionEnd(function () {
                    ltc.el.removeClass('ease-out');
                    ltc.hideOffScreen();
                });
            }

        }

        // Default: bounce back
        this.base.onPullEnd.apply(this, arguments);

    },

    onPullUp: function () {

        var ltc = C.lastTodoCollection;

        ltc.el.removeClass('drag');
        ltc.beginSwitch();
        ltc.moveY(0);

        this.el.removeClass('drag');
        this.beginSwitch();
        this.moveY(Math.min(-this.height, -C.client.height) - C.ITEM_HEIGHT * 2);

        C.setCurrentCollection(ltc);

        ltc.onTransitionEnd(function () {
            ltc.resetTopSwitch();
            ltc.style[C.client.transformProperty] = '';
            ltc.endSwitch();
            C.$wrapper[0].scrollTop = 0;
            if (C.touch.updateScrollBounds) C.touch.updateScrollBounds();
        });

        var t = this;
        t.onTransitionEnd(function () {
            t.positionForPulldown();
        });

    }

};

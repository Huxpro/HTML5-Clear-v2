// The C.Collection base object
// inherited by C.ListCollection and C.TodoCollection
//
// Modernized: uses native scrollTop instead of JS-driven momentum.
// moveY() is only used for collection-switch animations.
// Boundary pull gestures (pull-down/pull-up) are handled via pullOffset.

C.Collection = (function (raf) {

    var sortMoveSpeed       = 4.5;

    var beforeEditPosition  = 0; // used to record scroll position before edit focus

    return {

        init: function (data) {

            this.y = 0;           // only used for collection-switch transforms
            this.pullOffset = 0;  // tracks pull beyond scroll boundary
            this.upperBound = 0;
            this.initiated = false;

            // the data object points directly to the data inside the DB module.
            this.data = data || C.db.data;

            this.items = [];
            this.render();
            this.initDummyItems();
            this.populateItems();

            this.resetDragStates();

        },

        resetDragStates: function () {

            this.pullingDown = false;
            this.pastPullDownThreshold = false;

            this.longPullingDown = false;
            this.longPullingUp = false;
            this.pastLongPullDownThreshold = false;
            this.pastLongPullUpThreshold = false;

            this.pullOffset = 0;

        },

        initDummyItems: function () {

            // top dummy item
            this.topDummy = this.el.find('.dummy-item.top');
            this.topDummySlider = this.topDummy.find('.slider');
            this.topDummyText = this.topDummy.find('.title');
            this.topDummySliderStyle = this.topDummySlider[0].style;

        },

        populateItems: function () {

            var items = this.data.items,
                i = items.length,
                li;

            this.count = 0; // number of items (for C.TodoCollection this only counts items not done yet)
            this.hash = {}; // hash for getting items based on ID
            this.newIdFrom = i; // newly created item ID start from this

            while (i--) {
                this.addItem(items[i]);
            }

            this.hasDoneItems = this.items.length > this.count;
            this.updateBounds();

        },

        addItem: function (data) {

            var newItem = new this.itemType(data);

            newItem.collection = this;
            newItem.updatePosition();

            newItem.el
                .data('id', this.newIdFrom)
                .appendTo(this.el);

            this.items.push(newItem);
            this.hash[this.newIdFrom] = newItem;
            this.newIdFrom++;
            if (!newItem.data.done) this.count++;

            if (this.updateCount) {
                this.updateCount();
            }

            return newItem;

        },

        getItemById: function (id) {
            return this.hash[id];
        },

        getItemByOrder: function (order) {

            var i = this.items.length,
                item;
            while (i--) {
                item = this.items[i];
                if (item.data.order === order) {
                    return item;
                }
            }
        },

        getItemsBetween: function (origin, target) {

            var i = this.items.length,
                item,
                order,
                result = [];

            while (i--) {
                item = this.items[i];
                order = item.data.order;
                if ((order > origin && order <= target) || (order < origin && order >= target)) {
                    result.push(item);
                }
            }

            return result;

        },

        updateColor: function () {

            var i = this.items.length;
            while (i--) {
                this.items[i].updateColor();
            }

        },

        updatePosition: function () {

            var i = this.items.length;
            while (i--) {
                this.items[i].updatePosition();
            }

        },

        // getScrollY / setScrollY: wrappers for native scrollTop
        // returns negative value (same convention as old this.y)
        getScrollY: function () {
            return -C.$wrapper[0].scrollTop;
        },

        setScrollY: function (y) {
            C.$wrapper[0].scrollTop = -y;
        },

        // moveY: only used for collection-switch animations (not normal scrolling)
        moveY: function (y) {

            this.y = y;
            this.style[C.client.transformProperty] = 'translate3d(0px,' + y + 'px, 0px)';

        },

        // Hide/show for off-screen positioning.
        // With native scroll, off-screen collections can be scrolled into view.
        // display:none completely removes them from the rendering tree so they
        // don't contribute to scrollHeight.
        hideOffScreen: function () {
            this.el[0].style.display = 'none';
        },

        showForSwitch: function () {
            this.el[0].style.display = '';
        },

        // beginSwitch / endSwitch: disable native scroll during collection-switch animations
        beginSwitch: function () {

            C.$wrapper[0].classList.add('native-scroll-disabled');

        },

        endSwitch: function () {

            C.$wrapper[0].classList.remove('native-scroll-disabled');
            // Ensure scroll spacer matches the now-active collection
            if (C.currentCollection) {
                C.currentCollection.updateBounds(true);
            }

        },

        collapseAt: function (at, target) {

            var items = this.items,
                i = items.length,
                item,
                delIndex;

            while (i--) {
                item = items[i];
                if (item === target) {
                    if (target.deleted) delIndex = i; // found item to be deleted
                } else if (item.data.order > at && (!item.data.done || target.deleted)) {
                    item.data.order--;
                    item.updateColor();
                    item.updatePosition();
                } else {
                    item.updateColor();
                }
            }

            if (delIndex || delIndex === 0) { // if this item is deleted

                // remove its view object
                items.splice(delIndex, 1);
                this.updateBounds();

                // update count
                if (!target.data.done) {
                    this.count--;
                    if (this.updateCount) {
                        this.updateCount();
                    }
                }

                //update db data
                C.db.deleteItem(target.data, this.data);
                C.db.save();

            }

        },

        updateBounds: function (noMove) {

            this.height = this.items.length * C.ITEM_HEIGHT;
            this.upperBound = Math.min(0, C.client.height - (this.height + C.ITEM_HEIGHT));

            // Update global scroll spacer only for the active collection
            if (C.scrollSpacer && (!C.currentCollection || C.currentCollection === this)) {
                var spacerHeight = this.height + C.ITEM_HEIGHT;
                C.scrollSpacer[0].style.height = spacerHeight + 'px';
            }

            // When items are deleted, clamp scroll to bounds
            if (!noMove) {
                var wrapper = C.$wrapper[0];
                var maxScroll = Math.max(0, this.height + C.ITEM_HEIGHT - C.client.height);
                if (wrapper.scrollTop > maxScroll) {
                    wrapper.scrollTop = maxScroll;
                }
            }

        },

        // Pull gesture handlers (called by touch.js gesture arbiter)
        onPullStart: function () {
            this.pullOffset = 0;
            this.el.addClass('drag');
        },

        onPullMove: function (direction, dy) {

            // direction: 'down' when at top, 'up' when at bottom
            // dy: the raw pointer delta for this frame

            var elasticity = 0.45;
            this.pullOffset += dy * elasticity;

            if (direction === 'down') {

                // Pulling down from top: show pull-to-create dummy
                var offset = Math.max(0, this.pullOffset);

                // Move items down via a container transform
                this.style[C.client.transformProperty] = 'translate3d(0px,' + offset + 'px, 0px)';

                if (offset > 0) {
                    if (!this.pullingDown) {
                        this.pullingDown = true;
                        this.topDummy.show();
                    }
                    if (offset <= C.ITEM_HEIGHT) {
                        if (this.pastPullDownThreshold) {
                            this.pastPullDownThreshold = false;
                            this.topDummyText.text('Pull to Create ' + this.itemTypeText);
                        }
                        var pct = offset / C.ITEM_HEIGHT;
                        var r = Math.max(0, (1 - pct) * 90);
                        this.topDummySliderStyle[C.client.transformProperty] = 'rotateX(' + r + 'deg)';
                        this.topDummySliderStyle.opacity = pct / 2 + .5;
                    } else {
                        if (!this.pastPullDownThreshold) {
                            this.pastPullDownThreshold = true;
                            this.topDummySliderStyle[C.client.transformProperty] = 'none';
                            this.topDummySliderStyle.opacity = 1;
                            this.topDummyText.text('Release to Create ' + this.itemTypeText);
                        }
                    }
                } else {
                    if (this.pullingDown) {
                        this.pullingDown = false;
                        this.topDummy.hide();
                    }
                }

            }
            // 'up' direction handling is in subclasses (todo-collection, list-collection)

        },

        // Default onPullEnd: bounce back
        onPullEnd: function (direction) {

            this.el.removeClass('drag');

            // Reset pull transform
            this.el.addClass('ease-out');
            this.style[C.client.transformProperty] = 'translate3d(0px, 0px, 0px)';

            var col = this;
            this.onTransitionEnd(function () {
                col.el.removeClass('ease-out');
                col.style[C.client.transformProperty] = '';
            });

            this.topDummy.hide();
            if (this.bottomSwitch) this.bottomSwitch.hide();
            this.pullOffset = 0;

        },

        onTap: function () {

            // create new item at bottom
            if (this.hasDoneItems) {
                // the animation would be a middle fold
                this.createItemInBetween();
            } else {
                this.createItemAtBottom();
            }

        },

        // Sort auto-scroll: uses native scrollTop instead of moveY
        sortMove: function (dir, target) {

            var col = this,
                dy  = dir * sortMoveSpeed;

            col.sortMoving = true;
            loop();

            function loop () {

                if (!col.sortMoving) {
                    return;
                }

                raf(loop);

                var wrapper = C.$wrapper[0];
                var maxScroll = Math.max(0, col.height + C.ITEM_HEIGHT - C.client.height);
                var newScroll = Math.max(0, Math.min(maxScroll, wrapper.scrollTop - dy));

                var scrollDelta = newScroll - wrapper.scrollTop;
                wrapper.scrollTop = newScroll;

                // Move the sorting item to compensate for the scroll change
                target.moveY(target.y - scrollDelta);
                target.checkSwap();

            }

        },

        onEditStart: function (at, noRemember) {

            beforeEditPosition = noRemember ? 0 : C.$wrapper[0].scrollTop;

            var t = this;
            setTimeout(function () {

                if (!C.client.isTouch) {
                    C.$wrapper[0].scrollTop = at * C.ITEM_HEIGHT;
                }

                if (noRemember) {
                    t.el
                        .removeClass('drag')
                        .addClass('ease-out');
                    t.style[C.client.transformProperty] = 'translate3d(0px, 0px, 0px)';
                    t.onTransitionEnd(function () {
                        t.el.removeClass('ease-out');
                        t.style[C.client.transformProperty] = '';
                    });
                    C.$wrapper[0].scrollTop = 0;
                }
                t.el.addClass('shade');
            }, 0);

        },

        onEditDone: function (callback) {

            if (!C.client.isTouch) {
                C.$wrapper[0].scrollTop = beforeEditPosition;
            }

            this.el.removeClass('shade');
            if (this.items.length === 1) {
                callback();
            } else {
                this.onTransitionEnd(callback, true);
            }

        },

        onPinchOutStart: function () {
            console.log('pinchOut start');
        },

        onPinchOutMove: function (i, touch) {

        },

        onPinchOutCancel: function () {
            console.log('pinchOut cancel');
        },

        onPinchOutEnd: function () {
            console.log('pinchOut end');
        },

        createItemAtTop: function () {

            // hide and reset dummy item
            this.topDummy.hide();
            this.topDummyText.text('Pull to Create ' + this.itemTypeText);

            // Reset pull transform
            this.style[C.client.transformProperty] = '';

            // move all items down one row
            this.el.addClass('instant');
            var i = this.items.length,
                item;
            while (i--) {
                item = this.items[i];
                item.data.order++;
                item.moveY(item.y + C.ITEM_HEIGHT);
            }

            var col = this;
            setTimeout(function () {
                col.el.removeClass('instant');
            }, 0);

            var newData = {
                title: '',
                order: 0
            };

            // add the data to db
            C.db.addItem(newData, this.data);

            // create the item. It needs to be created from the same data object for binding
            var newItem = this.addItem(newData);

            this.updateColor();
            this.updateBounds();

            // passing in noRemember: true. do not remember starting position
            newItem.onEditStart(true);

        },

        createItemAtBottom: function () {

            var newData = {
                title: '',
                order: this.count
            };

            C.db.addItem(newData, this.data);

            var newItem = this.addItem(newData);
            this.updateColor();
            this.updateBounds();

            newItem.el.addClass('dummy-item bottom');

            newItem.el.find('.field').show().focus();

            setTimeout(function () {
                newItem.el.find('.slider')[0].style[C.client.transformProperty] = 'rotateX(0deg)';
                newItem.onTransitionEnd(function () {
                    newItem.el.removeClass('dummy-item bottom');
                    newItem.onEditStart();
                }, true);
            }, 50);

        },

        createItemInBetween: function () {

            var newData = {
                title: '',
                order: this.count
            };

            C.db.addItem(newData, this.data);

            var newItem = this.addItem(newData);
            this.updateColor();
            this.updateBounds();

            // dummy
            var lastUndone = this.getItemByOrder(this.count - 1),
                color = lastUndone.el.find('.slider').css('background-color'),
                dummy = new C.UnfoldDummy({
                    order: this.count,
                    color: color
                });
            this.el.append(dummy.el);

            newItem.el
                .addClass('drag')
                .css('opacity', .01) // hack hack hack...
                .find('.field').show().focus(); // trigger keyboard in advance

            var col = this;
            setTimeout(function () {
                // push done items 1 slot down
                var i = col.items.length,
                    item;

                while (i--) {
                    item = col.items[i];
                    if (item.data.done) {
                        item.data.order++;
                        item.moveY(item.y + C.ITEM_HEIGHT);
                    }
                }

                dummy.el.addClass('open');
                dummy.el.on(C.client.transitionEndEvent, function () {
                    dummy.el.off(C.client.transitionEndEvent);
                    newItem.el.css('opacity', '');
                    setTimeout(function () {
                        newItem.el.removeClass('drag')
                        newItem.onEditStart();
                        dummy.el.remove();
                        dummy = null;
                    }, 0);
                });
            }, 50);

        },

        // listen for transitionEnd
        onTransitionEnd: function (callback, noStrict) {

            var t = this;
            t.el.on(C.client.transitionEndEvent, function (e) {
                if (e.target !== this && !noStrict) return;
                t.el.off(C.client.transitionEndEvent);
                callback();
            });

        }

    };

}(C.raf));
